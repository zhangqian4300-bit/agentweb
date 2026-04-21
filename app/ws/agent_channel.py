"""
Reverse WebSocket Channel for Agent connection.

Protocol (JSON-RPC 2.0 style):
  - type: "auth"          Client → Server  (handshake with transient token)
  - type: "auth_ok"       Server → Client  (auth success, includes agent info)
  - type: "auth_fail"     Server → Client  (auth failed)
  - type: "ping"/"pong"   Bidirectional    (heartbeat, 30s interval)
  - type: "execute"       Server → Client  (task dispatch with optional attachment URLs)
  - type: "output"        Client → Server  (task response, supports streaming)
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

import redis.asyncio as aioredis

from app.core.database import async_session
from app.core.redis import get_redis
from app.models.agent import Agent
from app.models.user import User
from app.services.llm_service import chat_completion_json
from app.ws.connection_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()

HEARTBEAT_INTERVAL = 30
HEARTBEAT_MISSED_LIMIT = 2
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


async def _validate_token(token: str) -> Optional[dict]:
    redis: aioredis.Redis = get_redis()
    try:
        raw = await redis.get(f"agent_channel_token:{token}")
        if not raw:
            return None
        await redis.delete(f"agent_channel_token:{token}")
        return json.loads(raw)
    finally:
        await redis.aclose()


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

        name = intro.get("name", "Unnamed Agent")
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


async def _update_agent_status(agent_id: uuid.UUID, status: str) -> None:
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


async def _update_heartbeat(agent_id: uuid.UUID) -> None:
    async with async_session() as db:
        stmt = select(Agent).where(Agent.id == agent_id)
        result = await db.execute(stmt)
        agent = result.scalar_one_or_none()
        if agent:
            agent.last_heartbeat_at = datetime.now(timezone.utc)
            await db.commit()


async def _do_intro(ws: WebSocket) -> dict:
    request_id = f"intro_{uuid.uuid4().hex[:12]}"
    await ws.send_json({
        "type": "execute",
        "request_id": request_id,
        "message": _INTRO_PROMPT,
    })

    raw = await asyncio.wait_for(ws.receive_text(), timeout=INTRO_TIMEOUT)
    msg = json.loads(raw)
    if msg.get("type") != "output":
        return {}

    content = msg.get("content", "").strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"name": content[:50], "description": content[:200]}


async def _heartbeat_sender(ws: WebSocket, agent_id: uuid.UUID) -> None:
    missed = 0
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            try:
                await ws.send_json({"type": "ping"})
                missed = 0
            except Exception:
                missed += 1
                if missed >= HEARTBEAT_MISSED_LIMIT:
                    logger.warning(f"Agent {agent_id}: {missed} heartbeats missed, closing")
                    await ws.close(code=4008, reason="Heartbeat timeout")
                    return
            await _update_heartbeat(agent_id)
    except asyncio.CancelledError:
        pass


@router.websocket("/ws/agent-channel")
async def agent_channel(websocket: WebSocket, token: str = ""):
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    await websocket.accept()

    # Phase 1: Auth
    token_data = await _validate_token(token)
    if not token_data:
        await websocket.send_json({"type": "auth_fail", "reason": "Invalid or expired token"})
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = uuid.UUID(token_data["user_id"])
    await websocket.send_json({"type": "auth_ok", "user_id": str(user_id)})
    logger.info(f"Agent channel auth OK for user {user_id}")

    # Phase 2: Intro (if no existing agent)
    async with async_session() as db:
        stmt = (
            select(Agent)
            .where(Agent.owner_id == user_id)
            .order_by(Agent.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        existing_agent = result.scalar_one_or_none()

    if existing_agent:
        agent = existing_agent
        await _update_agent_status(agent.id, "online")
    else:
        try:
            intro = await _do_intro(websocket)
        except (asyncio.TimeoutError, Exception) as e:
            logger.warning(f"Intro failed for user {user_id}: {e}")
            await websocket.send_json({
                "type": "error",
                "reason": "Self-introduction timeout or failed",
            })
            await websocket.close(code=4002, reason="Intro failed")
            return
        agent = await _find_or_create_agent(user_id, intro)

    await websocket.send_json({
        "type": "ready",
        "agent_id": str(agent.id),
        "agent_name": agent.name,
    })

    # Phase 3: Register in ConnectionManager & enter message loop
    await manager.connect(str(agent.id), websocket)
    heartbeat_task = asyncio.create_task(_heartbeat_sender(websocket, agent.id))

    try:
        while True:
            raw = await asyncio.wait_for(
                websocket.receive_text(),
                timeout=HEARTBEAT_INTERVAL * (HEARTBEAT_MISSED_LIMIT + 1),
            )
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "pong":
                await _update_heartbeat(agent.id)

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "output":
                request_id = msg.get("request_id")
                content = msg.get("content", "")
                if request_id:
                    response_data = {
                        "type": "response",
                        "request_id": request_id,
                        "content": content,
                        "usage": msg.get("usage", {}),
                    }
                    manager.resolve_response(request_id, response_data)

            elif msg_type == "stream_output":
                request_id = msg.get("request_id")
                content = msg.get("content", "")
                done = msg.get("done", False)
                if request_id:
                    if done:
                        manager.push_stream_chunk(request_id, {
                            "type": "stream_end",
                            "request_id": request_id,
                            "usage": msg.get("usage", {}),
                        })
                    else:
                        manager.push_stream_chunk(request_id, {
                            "type": "stream_chunk",
                            "request_id": request_id,
                            "content": content,
                        })

    except (WebSocketDisconnect, asyncio.TimeoutError, Exception) as e:
        logger.info(f"Agent channel closed for {agent.id}: {type(e).__name__}: {e}")
    finally:
        heartbeat_task.cancel()
        await manager.disconnect(str(agent.id))
        await _update_agent_status(agent.id, "offline")
