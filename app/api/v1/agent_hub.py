import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis

from app.config import settings
from app.core.database import get_db
from app.core.redis import get_redis
from app.dependencies import get_current_user
from app.models.agent import Agent
from app.models.user import User
from app.ws.connection_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent-hub", tags=["agent-hub"])

TOKEN_TTL = 300


@router.post("/token")
async def create_token(
    user: User = Depends(get_current_user),
):
    token = uuid.uuid4().hex
    redis: aioredis.Redis = get_redis()
    try:
        await redis.setex(
            f"agent_channel_token:{token}",
            TOKEN_TTL,
            json.dumps({"user_id": str(user.id)}),
        )
    finally:
        await redis.aclose()

    return {"token": token, "expires_in": TOKEN_TTL}


@router.get("/status")
async def hub_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    listed_stmt = (
        select(Agent)
        .where(Agent.owner_id == user.id, Agent.is_listed == True)
        .order_by(Agent.created_at.desc())
        .limit(1)
    )
    result = await db.execute(listed_stmt)
    listed = result.scalar_one_or_none()
    if listed:
        online = manager.is_online(str(listed.id))
        return {
            "status": "online" if online else "offline",
            "agent_id": str(listed.id),
            "name": listed.name,
        }

    unlisted_stmt = (
        select(Agent)
        .where(Agent.owner_id == user.id, Agent.is_listed == False)
        .order_by(Agent.created_at.desc())
        .limit(1)
    )
    result = await db.execute(unlisted_stmt)
    pending = result.scalar_one_or_none()
    if pending:
        online = manager.is_online(str(pending.id))
        return {
            "status": "pending_review",
            "connected": online,
            "agent_id": str(pending.id),
            "name": pending.name,
            "description": pending.description,
            "category": pending.category,
            "pricing": float(pending.pricing_per_million_tokens),
            "capabilities": pending.capabilities,
        }

    return {"status": "not_connected"}


@router.get("/prompt")
async def get_prompt(
    user: User = Depends(get_current_user),
):
    token_resp = await create_token(user)
    token = token_resp["token"]

    base_http = settings.site_url.rstrip("/")
    base_ws = base_http.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{base_ws}/ws/agent-channel?token={token}"
    submit_url = f"{base_http}/api/v1/agent-hub/submit-http"

    script = _build_connect_script(ws_url, submit_url, token)

    prompt = f"""请立即执行以下 Python 脚本，它会将你连接到 AgentWeb 智能体市场平台。

连接后平台会先让你自我介绍（你的名称、能力），然后开始接收用户任务。

注意：
- 保持脚本运行，不要中断
- 收到任务后认真处理，回复要专业准确
- 附件链接可通过 HTTP GET 直接下载

```python
{script}
```

请现在执行这段代码。"""

    return {"prompt": prompt, "token": token}


def _build_connect_script(ws_url: str, submit_url: str, token: str) -> str:
    return f'''\
import asyncio, json, sys

try:
    import websockets
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets", "-q"])
    import websockets

WS_URL = "{ws_url}"
HEARTBEAT_INTERVAL = 25

async def run():
    backoff = 1
    while True:
        try:
            async with websockets.connect(WS_URL) as ws:
                backoff = 1
                print("[AgentWeb] 正在连接...", file=sys.stderr)

                # Wait for auth result
                auth_msg = json.loads(await ws.recv())
                if auth_msg.get("type") == "auth_fail":
                    print(f"[AgentWeb] 认证失败: {{auth_msg.get('reason')}}", file=sys.stderr)
                    return
                print("[AgentWeb] 认证成功", file=sys.stderr)

                # Heartbeat coroutine
                async def heartbeat():
                    while True:
                        await asyncio.sleep(HEARTBEAT_INTERVAL)
                        await ws.send(json.dumps({{"type": "pong"}}))

                hb = asyncio.create_task(heartbeat())
                try:
                    async for raw in ws:
                        msg = json.loads(raw)
                        t = msg.get("type")

                        if t == "ping":
                            await ws.send(json.dumps({{"type": "pong"}}))

                        elif t == "ready":
                            print(f"[AgentWeb] 已上线: {{msg.get('agent_name')}}", file=sys.stderr)

                        elif t in ("execute", "request"):
                            req_id = msg["request_id"]
                            task = msg.get("message", "")
                            print(f"[AgentWeb] 收到任务 {{req_id}}", file=sys.stderr)

                            result = process_task(task)

                            await ws.send(json.dumps({{
                                "type": "output",
                                "request_id": req_id,
                                "content": result,
                            }}))
                            print(f"[AgentWeb] 已提交 {{req_id}}", file=sys.stderr)
                finally:
                    hb.cancel()

        except Exception as e:
            print(f"[AgentWeb] 连接断开: {{e}}, {{backoff}}s 后重连", file=sys.stderr)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)

def process_task(message: str) -> str:
    """处理平台下发的任务，返回回答文本。"""
    # 默认实现：直接返回消息供外部处理
    # Hermes 等 Agent 框架会自动替换此函数
    return f"收到任务: {{message}}"

asyncio.run(run())
'''
