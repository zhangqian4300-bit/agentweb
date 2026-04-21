from typing import AsyncIterator, Optional

import redis.asyncio as aioredis

from app.core.exceptions import AgentOfflineError, AgentTimeoutError
from app.services.webhook_service import webhook_invoke, webhook_invoke_stream
from app.ws.connection_manager import manager

SESSION_TTL = 3600


async def resolve_session(
    redis: aioredis.Redis, session_id: str, agent_id: str
) -> str:
    key = f"session:{session_id}"
    existing = await redis.get(key)
    if existing:
        return existing.decode()
    await redis.setex(key, SESSION_TTL, agent_id)
    return agent_id


async def route_to_agent(
    agent_id: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    endpoint_url: Optional[str] = None,
    endpoint_api_key: Optional[str] = None,
    timeout: float = 300,
) -> dict:
    if endpoint_url:
        return await webhook_invoke(
            endpoint_url, request_id, session_id, message, metadata,
            endpoint_api_key=endpoint_api_key, timeout=timeout,
        )
    return await _route_ws(agent_id, request_id, session_id, message, metadata, timeout)


async def route_to_agent_stream(
    agent_id: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    endpoint_url: Optional[str] = None,
    endpoint_api_key: Optional[str] = None,
    timeout: float = 300,
) -> AsyncIterator[dict]:
    if endpoint_url:
        async for chunk in webhook_invoke_stream(
            endpoint_url, request_id, session_id, message, metadata,
            endpoint_api_key=endpoint_api_key, timeout=timeout,
        ):
            yield chunk
        return
    async for chunk in _route_ws_stream(
        agent_id, request_id, session_id, message, metadata, timeout
    ):
        yield chunk


async def _route_ws(
    agent_id: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    timeout: float = 300,
) -> dict:
    if not await manager.wait_online(agent_id):
        raise AgentOfflineError(agent_id)

    msg = {
        "type": "request",
        "request_id": request_id,
        "session_id": session_id,
        "message": message,
        "metadata": metadata,
    }

    try:
        response = await manager.send_request(agent_id, msg, timeout=timeout)
        return response
    except TimeoutError:
        raise AgentTimeoutError(agent_id)
    except ConnectionError:
        raise AgentOfflineError(agent_id)


async def _route_ws_stream(
    agent_id: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    timeout: float = 300,
) -> AsyncIterator[dict]:
    if not await manager.wait_online(agent_id):
        raise AgentOfflineError(agent_id)

    msg = {
        "type": "request",
        "request_id": request_id,
        "session_id": session_id,
        "message": message,
        "metadata": metadata,
        "stream": True,
    }

    try:
        async for chunk in manager.send_request_stream(agent_id, msg, timeout=timeout):
            yield chunk
    except TimeoutError:
        raise AgentTimeoutError(agent_id)
    except ConnectionError:
        raise AgentOfflineError(agent_id)


# Keep old names for backward compatibility with existing imports
route_request = _route_ws
route_request_stream = _route_ws_stream
