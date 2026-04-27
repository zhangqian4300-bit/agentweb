import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import async_session, get_db
from app.core.exceptions import AgentOfflineError, AgentTimeoutError, NotFoundError
from app.services.auth_service import validate_api_key
from app.services.agent_service import get_agent
from app.services.routing_service import resolve_session, route_to_agent, route_to_agent_stream
from app.services.metering_service import record_usage
from app.core.redis import get_redis

logger = logging.getLogger(__name__)
router = APIRouter()

HEARTBEAT_INTERVAL = 30
HEARTBEAT_TIMEOUT = 90
MIN_BALANCE = 1.0


async def _authenticate(api_key: str):
    async with async_session() as db:
        user, key_obj = await validate_api_key(db, api_key)
        return user, key_obj


async def _heartbeat_sender(ws: WebSocket):
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await ws.send_json({"type": "ping"})
    except Exception:
        pass


async def _handle_chat(ws: WebSocket, data: dict, user, history: list):
    agent_id = data.get("agent_id")
    message = data.get("message", "").strip()
    stream = data.get("stream", True)
    session_id = data.get("session_id")
    metadata = data.get("metadata", {})

    if not agent_id or not message:
        await ws.send_json({"type": "error", "detail": "agent_id 和 message 必填"})
        return

    if float(user.balance) < MIN_BALANCE:
        await ws.send_json({"type": "error", "detail": "余额不足"})
        return

    history.append({"role": "user", "content": message})
    chat_metadata = {**metadata, "messages": list(history)}

    async with async_session() as db:
        try:
            agent = await get_agent(db, uuid.UUID(agent_id))
        except (NotFoundError, ValueError):
            history.pop()
            await ws.send_json({"type": "error", "detail": "Agent 不存在"})
            return

        request_id = str(uuid.uuid4())
        if not session_id:
            session_id = f"sess_{uuid.uuid4().hex[:12]}"

        redis = get_redis()
        try:
            await resolve_session(redis, session_id, agent_id)
        finally:
            await redis.aclose()

        try:
            if stream:
                total_content = ""
                final_usage = {}
                async for chunk in route_to_agent_stream(
                    agent_id=str(agent.id),
                    request_id=request_id,
                    session_id=session_id,
                    message=message,
                    metadata=chat_metadata,
                    endpoint_url=agent.endpoint_url,
                    endpoint_api_key=agent.endpoint_api_key,
                ):
                    chunk_type = chunk.get("type")
                    if chunk_type == "stream_chunk":
                        total_content += chunk.get("content", "")
                        await ws.send_json({
                            "type": "stream_chunk",
                            "request_id": request_id,
                            "content": chunk.get("content", ""),
                        })
                    elif chunk_type in ("typing", "edit", "tool_progress"):
                        await ws.send_json({
                            "type": chunk_type,
                            "request_id": request_id,
                            **{k: v for k, v in chunk.items() if k not in ("type", "request_id")},
                        })
                    elif chunk_type == "stream_end":
                        final_usage = chunk.get("usage", {})
                        input_tokens = final_usage.get("input_tokens", 0)
                        output_tokens = final_usage.get("output_tokens", 0)
                        total_tokens = input_tokens + output_tokens
                        cost = float(agent.pricing_per_million_tokens) * total_tokens / 1_000_000

                        await record_usage(
                            db=db,
                            request_id=uuid.UUID(request_id),
                            agent_id=agent.id,
                            consumer_id=user.id,
                            provider_id=agent.owner_id,
                            session_id=session_id,
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            price_per_million=agent.pricing_per_million_tokens,
                        )

                        history.append({"role": "assistant", "content": total_content})

                        await ws.send_json({
                            "type": "stream_end",
                            "request_id": request_id,
                            "session_id": session_id,
                            "usage": {
                                "input_tokens": input_tokens,
                                "output_tokens": output_tokens,
                                "total_tokens": total_tokens,
                            },
                            "cost": {"amount": round(cost, 6), "currency": "CNY"},
                        })
            else:
                response = await route_to_agent(
                    agent_id=str(agent.id),
                    request_id=request_id,
                    session_id=session_id,
                    message=message,
                    metadata=chat_metadata,
                    endpoint_url=agent.endpoint_url,
                    endpoint_api_key=agent.endpoint_api_key,
                )

                usage_data = response.get("usage", {})
                input_tokens = usage_data.get("input_tokens", 0)
                output_tokens = usage_data.get("output_tokens", 0)
                total_tokens = input_tokens + output_tokens
                cost = float(agent.pricing_per_million_tokens) * total_tokens / 1_000_000

                await record_usage(
                    db=db,
                    request_id=uuid.UUID(request_id),
                    agent_id=agent.id,
                    consumer_id=user.id,
                    provider_id=agent.owner_id,
                    session_id=session_id,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    price_per_million=agent.pricing_per_million_tokens,
                )

                history.append({"role": "assistant", "content": response.get("content", "")})

                await ws.send_json({
                    "type": "response",
                    "request_id": request_id,
                    "session_id": session_id,
                    "content": response.get("content", ""),
                    "usage": {
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "total_tokens": total_tokens,
                    },
                    "cost": {"amount": round(cost, 6), "currency": "CNY"},
                })

        except AgentOfflineError:
            await ws.send_json({"type": "error", "request_id": request_id, "detail": "Agent 离线"})
        except AgentTimeoutError:
            await ws.send_json({"type": "error", "request_id": request_id, "detail": "Agent 响应超时"})
        except Exception as e:
            logger.exception("chat handler error")
            await ws.send_json({"type": "error", "request_id": request_id, "detail": str(e)})


@router.websocket("/ws/chat")
async def consumer_chat_websocket(websocket: WebSocket, api_key: str = ""):
    if not api_key:
        await websocket.close(code=4001, reason="Missing api_key")
        return

    await websocket.accept()

    try:
        user, key_obj = await _authenticate(api_key)
    except Exception:
        await websocket.send_json({"type": "error", "detail": "Invalid API key"})
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.send_json({"type": "connected"})

    heartbeat_task = asyncio.create_task(_heartbeat_sender(websocket))
    history: list = []

    try:
        while True:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_TIMEOUT)
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "pong":
                continue

            elif msg_type == "chat":
                await _handle_chat(websocket, data, user, history)

            elif msg_type == "clear_history":
                history.clear()
                await websocket.send_json({"type": "history_cleared"})

            else:
                await websocket.send_json({"type": "error", "detail": f"未知消息类型: {msg_type}"})

    except (WebSocketDisconnect, asyncio.TimeoutError):
        logger.info(f"Consumer WS disconnected: user={user.id}")
    except Exception as e:
        logger.exception(f"Consumer WS error: {e}")
    finally:
        heartbeat_task.cancel()
