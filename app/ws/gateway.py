import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import async_session
from app.core.security import hash_api_key
from app.models.agent import Agent
from app.models.user import APIKey
from app.services.llm_service import chat_completion_json
from app.ws.connection_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()

HEARTBEAT_INTERVAL = 30
HEARTBEAT_TIMEOUT = 60
INTRO_TIMEOUT = 120

_INTRO_PROMPT = (
    '请介绍一下你自己，返回 JSON：'
    '{"name":"你的名称(2-5词)","description":"你能做什么(1-2句话)",'
    '"version":"1.0.0","capabilities":[{"name":"能力名","description":"说明"}]}\n'
    '仅返回 JSON。'
)

_CATEGORIZE_PROMPT = """\
根据以下 Agent 信息，从分类列表中选择最匹配的一个，并建议定价。

Agent 名称：{name}
Agent 描述：{description}
Agent 能力：{capabilities}

可选分类：文献与知识, 数据与计算, 生命科学, 化学与材料, 物理与工程, 地球与环境, 数学与AI, 写作与协作, 其他

返回 JSON：{{"category": "分类名", "suggested_pricing": 一个数字（元/百万tokens，5-50）}}
仅返回 JSON。"""


async def authenticate_agent(agent_key: str) -> tuple:
    key_hash = hash_api_key(agent_key)
    async with async_session() as db:
        stmt = select(APIKey).where(
            APIKey.key_hash == key_hash,
            APIKey.is_active == True,
            APIKey.key_type == "agent_key",
        )
        result = await db.execute(stmt)
        api_key = result.scalar_one_or_none()
        if not api_key:
            return None, None, None

        stmt = select(Agent).where(Agent.owner_id == api_key.user_id)
        result = await db.execute(stmt)
        agents = result.scalars().all()
        return api_key.user_id, agents, api_key


async def update_agent_status(agent_id: uuid.UUID, status: str) -> None:
    async with async_session() as db:
        stmt = select(Agent).where(Agent.id == agent_id)
        result = await db.execute(stmt)
        agent = result.scalar_one_or_none()
        if agent:
            agent.status = status
            now = datetime.now(timezone.utc)
            if status == "online":
                agent.last_heartbeat_at = now
            else:
                agent.last_online_at = now
            await db.commit()


async def update_heartbeat(agent_id: uuid.UUID) -> None:
    async with async_session() as db:
        stmt = select(Agent).where(Agent.id == agent_id)
        result = await db.execute(stmt)
        agent = result.scalar_one_or_none()
        if agent:
            agent.last_heartbeat_at = datetime.now(timezone.utc)
            await db.commit()


async def heartbeat_sender(websocket: WebSocket, agent_id: uuid.UUID) -> None:
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await websocket.send_json({"type": "ping"})
    except Exception:
        pass


async def _do_intro(ws: WebSocket) -> dict:
    request_id = f"intro_{uuid.uuid4().hex[:12]}"
    await ws.send_json({
        "type": "execute",
        "request_id": request_id,
        "message": _INTRO_PROMPT,
    })

    deadline = asyncio.get_event_loop().time() + INTRO_TIMEOUT
    while True:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            return {}
        raw = await asyncio.wait_for(ws.receive_text(), timeout=remaining)
        msg = json.loads(raw)
        if msg.get("type") == "output":
            break
        # skip pong, heartbeat, etc.

    content = msg.get("content", "").strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"name": content[:50], "description": content[:200]}


async def _find_or_create_agent(user_id: uuid.UUID, intro: dict) -> Agent:
    async with async_session() as db:
        stmt = (
            select(Agent)
            .where(Agent.owner_id == user_id)
            .order_by(Agent.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        agent = result.scalar_one_or_none()

        if agent:
            agent.status = "online"
            agent.last_heartbeat_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(agent)
            return agent

        name = intro.get("name") or "Unnamed Agent"
        description = intro.get("description", "")
        version = intro.get("version", "1.0.0")
        capabilities = intro.get("capabilities", [])

        caps_dicts = []
        for c in capabilities:
            if isinstance(c, dict):
                caps_dicts.append({
                    "name": c.get("name", ""),
                    "description": c.get("description", ""),
                })

        caps_text = ", ".join(c.get("name", "") for c in caps_dicts) or "未声明"
        try:
            suggestion = await chat_completion_json([{
                "role": "user",
                "content": _CATEGORIZE_PROMPT.format(
                    name=name, description=description, capabilities=caps_text,
                ),
            }])
            category = suggestion.get("category", "其他")
            suggested_pricing = suggestion.get("suggested_pricing", 10)
        except Exception:
            category = "其他"
            suggested_pricing = 10

        agent = Agent(
            owner_id=user_id,
            name=name,
            description=description,
            version=version,
            capabilities=caps_dicts,
            pricing_per_million_tokens=suggested_pricing,
            category=category,
            status="online",
            is_listed=False,
            last_heartbeat_at=datetime.now(timezone.utc),
        )
        db.add(agent)
        await db.commit()
        await db.refresh(agent)
        return agent


@router.websocket("/ws/agent")
async def agent_websocket(websocket: WebSocket, agent_key: str = ""):
    if not agent_key:
        await websocket.close(code=4001, reason="Missing agent_key")
        return

    await websocket.accept()

    user_id, agents, api_key_obj = await authenticate_agent(agent_key)
    if not user_id:
        await websocket.send_json({"type": "error", "detail": "Invalid agent_key"})
        await websocket.close(code=4001, reason="Unauthorized")
        return

    if not agents:
        # No agents yet — trigger self-intro to auto-register
        try:
            intro = await _do_intro(websocket)
        except (asyncio.TimeoutError, Exception) as e:
            logger.warning(f"Intro failed for user {user_id}: {e}")
            await websocket.send_json({
                "type": "error",
                "detail": "Self-introduction timeout or failed",
            })
            await websocket.close(code=4002, reason="Intro failed")
            return

        agent = await _find_or_create_agent(user_id, intro)
        agents = [agent]

    connected_agents = []
    for agent in agents:
        await manager.connect(str(agent.id), websocket)
        await update_agent_status(agent.id, "online")
        connected_agents.append(str(agent.id))

    await websocket.send_json({
        "type": "connected",
        "agent_ids": connected_agents,
    })

    heartbeat_task = asyncio.create_task(heartbeat_sender(websocket, agents[0].id))

    try:
        while True:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_TIMEOUT)
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "pong":
                for agent in agents:
                    await update_heartbeat(agent.id)

            elif msg_type == "response":
                request_id = data.get("request_id")
                if request_id:
                    manager.resolve_response(request_id, data)

            elif msg_type == "stream_chunk":
                request_id = data.get("request_id")
                if request_id:
                    manager.push_stream_chunk(request_id, data)

            elif msg_type == "stream_end":
                request_id = data.get("request_id")
                if request_id:
                    manager.push_stream_chunk(request_id, data)

            elif msg_type in ("typing", "edit", "tool_progress", "send"):
                request_id = data.get("request_id")
                if request_id:
                    manager.push_stream_chunk(request_id, data)

    except (WebSocketDisconnect, asyncio.TimeoutError, Exception) as e:
        logger.info(f"Agent connection ended: {e}")
    finally:
        heartbeat_task.cancel()
        for agent in agents:
            await manager.disconnect(str(agent.id))
            await update_agent_status(agent.id, "offline")
