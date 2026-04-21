import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import async_session
from app.core.security import hash_api_key
from app.models.agent import Agent
from app.models.user import APIKey
from app.ws.connection_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()

HEARTBEAT_INTERVAL = 30
HEARTBEAT_TIMEOUT = 60


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
            return None, None

        stmt = select(Agent).where(Agent.owner_id == api_key.user_id)
        result = await db.execute(stmt)
        agents = result.scalars().all()
        return api_key.user_id, agents


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


@router.websocket("/ws/agent")
async def agent_websocket(websocket: WebSocket, agent_key: str = ""):
    if not agent_key:
        await websocket.close(code=4001, reason="Missing agent_key")
        return

    await websocket.accept()

    user_id, agents = await authenticate_agent(agent_key)
    if not user_id or not agents:
        await websocket.send_json({"type": "error", "detail": "Invalid agent_key or no agents"})
        await websocket.close(code=4001, reason="Unauthorized")
        return

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

    except (WebSocketDisconnect, asyncio.TimeoutError, Exception) as e:
        logger.info(f"Agent connection ended: {e}")
    finally:
        heartbeat_task.cancel()
        for agent in agents:
            await manager.disconnect(str(agent.id))
            await update_agent_status(agent.id, "offline")
