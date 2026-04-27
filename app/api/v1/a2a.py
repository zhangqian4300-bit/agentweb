import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.exceptions import InsufficientBalanceError
from app.core.redis import get_redis
from app.dependencies import get_api_key_user
from app.models.user import APIKey, User
from app.schemas.a2a import (
    A2AArtifact,
    A2AError,
    A2AErrorResponse,
    A2APart,
    A2ARequest,
    A2AResponse,
    A2AStatus,
    A2ATaskResult,
    A2AUsage,
    A2AV1SendRequest,
)
from app.services.agent_service import resolve_agent_by_model
from app.services.metering_service import record_usage
from app.services.routing_service import resolve_session, route_to_agent, route_to_agent_stream

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/a2a", tags=["a2a"])

MIN_BALANCE = 1.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _error_response(req_id, code: int, message: str) -> dict:
    return A2AErrorResponse(
        id=req_id,
        error=A2AError(code=code, message=message),
    ).model_dump(by_alias=True)


def _extract_text(message) -> str:
    if not message or not message.parts:
        return ""
    texts = []
    for p in message.parts:
        if p.text:
            texts.append(p.text)
        elif p.kind == "text" and p.text:
            texts.append(p.text)
    return "\n".join(texts)


def _extract_text_from_v1(message: A2AV1SendRequest) -> str:
    if not message.message or not message.message.parts:
        return ""
    return "\n".join(p.text for p in message.message.parts if p.text)


async def _resolve_agent(db: AsyncSession, agent_id: Optional[str]):
    if not agent_id:
        return None
    try:
        return await resolve_agent_by_model(db, agent_id)
    except Exception:
        return None


async def _do_route(agent, message_text, metadata, user, db):
    """Shared routing + metering logic for both legacy and v1.0 endpoints."""
    request_id = str(uuid.uuid4())
    session_id = f"sess_{uuid.uuid4().hex[:12]}"

    redis: aioredis.Redis = get_redis()
    try:
        await resolve_session(redis, session_id, str(agent.id))
    finally:
        await redis.aclose()

    response = await route_to_agent(
        agent_id=str(agent.id),
        request_id=request_id,
        session_id=session_id,
        message=message_text,
        metadata=metadata,
        endpoint_url=agent.endpoint_url,
        endpoint_api_key=agent.endpoint_api_key,
        endpoint_protocol=agent.endpoint_protocol or "openai",
    )

    usage_data = response.get("usage", {})
    input_tokens = usage_data.get("input_tokens", 0)
    output_tokens = usage_data.get("output_tokens", 0)

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

    return response, request_id, session_id, input_tokens, output_tokens


# ===================================================================
# Legacy JSON-RPC endpoint  (tasks/send, tasks/sendSubscribe)
# ===================================================================

@router.post("/rpc")
@router.post("/rpc/{path_agent_id}")
async def a2a_rpc(
    request: Request,
    path_agent_id: Optional[str] = None,
    auth: tuple = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    user: User = auth[0]
    api_key: APIKey = auth[1]

    body = await request.json()
    try:
        rpc = A2ARequest(**body)
    except Exception as e:
        return _error_response(body.get("id"), -32600, f"Invalid request: {e}")

    method = rpc.method
    req_id = rpc.id

    if method == "tasks/send":
        return await _handle_send(rpc, path_agent_id, user, db)
    elif method == "tasks/sendSubscribe":
        return await _handle_send_subscribe(rpc, path_agent_id, user, db)
    elif method == "tasks/get":
        return _error_response(req_id, -32601, "tasks/get: task state is not persisted in this implementation")
    elif method == "tasks/cancel":
        return _error_response(req_id, -32601, "tasks/cancel: not supported in this implementation")
    else:
        return _error_response(req_id, -32601, f"Unknown method: {method}")


async def _handle_send(rpc: A2ARequest, path_agent_id: Optional[str], user: User, db: AsyncSession):
    if float(user.balance) < MIN_BALANCE:
        raise InsufficientBalanceError()

    task_id = rpc.params.id or f"task-{uuid.uuid4().hex[:12]}"
    message_text = _extract_text(rpc.params.message)
    metadata_dict = (rpc.params.message.metadata or {}) if rpc.params.message else {}

    agent_id_str = path_agent_id or metadata_dict.get("agent_id")
    agent = await _resolve_agent(db, agent_id_str)
    if not agent:
        return _error_response(rpc.id, -32602, "Cannot resolve agent. Provide agent_id in metadata or URL path.")

    messages_raw = []
    if rpc.params.message:
        messages_raw = [{"role": rpc.params.message.role, "content": message_text}]
    metadata = {**metadata_dict, "messages": messages_raw}

    response, _, _, input_tokens, output_tokens = await _do_route(agent, message_text, metadata, user, db)

    content = response.get("content", "")
    return A2AResponse(
        id=rpc.id,
        result=A2ATaskResult(
            taskId=task_id,
            status=A2AStatus(state="completed"),
            artifacts=[A2AArtifact(parts=[A2APart(text=content)])],
            usage=A2AUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
            ),
        ),
    ).model_dump(by_alias=True)


async def _handle_send_subscribe(rpc: A2ARequest, path_agent_id: Optional[str], user: User, db: AsyncSession):
    if float(user.balance) < MIN_BALANCE:
        raise InsufficientBalanceError()

    task_id = rpc.params.id or f"task-{uuid.uuid4().hex[:12]}"
    message_text = _extract_text(rpc.params.message)
    metadata_dict = (rpc.params.message.metadata or {}) if rpc.params.message else {}

    agent_id_str = path_agent_id or metadata_dict.get("agent_id")
    agent = await _resolve_agent(db, agent_id_str)
    if not agent:
        return _error_response(rpc.id, -32602, "Cannot resolve agent. Provide agent_id in metadata or URL path.")

    request_id = str(uuid.uuid4())
    session_id = f"sess_{uuid.uuid4().hex[:12]}"

    redis: aioredis.Redis = get_redis()
    try:
        await resolve_session(redis, session_id, str(agent.id))
    finally:
        await redis.aclose()

    messages_raw = []
    if rpc.params.message:
        messages_raw = [{"role": rpc.params.message.role, "content": message_text}]
    metadata = {**metadata_dict, "messages": messages_raw}

    return EventSourceResponse(
        _legacy_stream_events(
            rpc_id=rpc.id,
            task_id=task_id,
            agent=agent,
            request_id=request_id,
            session_id=session_id,
            message=message_text,
            metadata=metadata,
            user=user,
            db=db,
        )
    )


async def _legacy_stream_events(
    rpc_id, task_id, agent, request_id, session_id, message, metadata, user, db
):
    status_working = {
        "jsonrpc": "2.0",
        "id": rpc_id,
        "result": {
            "taskId": task_id,
            "status": {"state": "working"},
        },
    }
    yield {"event": "status", "data": json.dumps(status_working)}

    collected_text = ""

    async for chunk in route_to_agent_stream(
        agent_id=str(agent.id),
        request_id=request_id,
        session_id=session_id,
        message=message,
        metadata=metadata,
        endpoint_url=agent.endpoint_url,
        endpoint_api_key=agent.endpoint_api_key,
        endpoint_protocol=agent.endpoint_protocol or "openai",
    ):
        chunk_type = chunk.get("type")
        if chunk_type == "stream_chunk":
            content = chunk.get("content", "")
            collected_text += content
            artifact_event = {
                "jsonrpc": "2.0",
                "id": rpc_id,
                "result": {
                    "taskId": task_id,
                    "artifact": {
                        "parts": [{"kind": "text", "text": content}],
                        "partial": True,
                    },
                },
            }
            yield {"event": "artifact", "data": json.dumps(artifact_event)}

        elif chunk_type == "stream_end":
            usage_data = chunk.get("usage", {})
            input_tokens = usage_data.get("input_tokens", 0)
            output_tokens = usage_data.get("output_tokens", 0)

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

    final_artifact = {
        "jsonrpc": "2.0",
        "id": rpc_id,
        "result": {
            "taskId": task_id,
            "artifact": {
                "parts": [{"kind": "text", "text": collected_text}],
                "partial": False,
            },
        },
    }
    yield {"event": "artifact", "data": json.dumps(final_artifact)}

    status_done = {
        "jsonrpc": "2.0",
        "id": rpc_id,
        "result": {
            "taskId": task_id,
            "status": {"state": "completed"},
        },
    }
    yield {"event": "status", "data": json.dumps(status_done)}


# ===================================================================
# v1.0 REST endpoints  (POST /message:send, /message:stream)
# ===================================================================

@router.post("/message:send")
@router.post("/message:send/{path_agent_id}")
async def v1_message_send(
    request: Request,
    path_agent_id: Optional[str] = None,
    auth: tuple = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    user: User = auth[0]

    body = await request.json()
    try:
        req = A2AV1SendRequest(**body)
    except Exception as e:
        return {"error": {"code": 400, "message": f"Invalid request: {e}"}}

    if float(user.balance) < MIN_BALANCE:
        raise InsufficientBalanceError()

    message_text = _extract_text_from_v1(req)
    metadata_dict = req.message.metadata or {}

    agent_id_str = path_agent_id or metadata_dict.get("agent_id")
    agent = await _resolve_agent(db, agent_id_str)
    if not agent:
        return {"error": {"code": 404, "message": "Cannot resolve agent. Provide agent_id in metadata or URL path."}}

    messages_raw = [{"role": req.message.role, "content": message_text}]
    metadata = {**metadata_dict, "messages": messages_raw}

    response, request_id, _, input_tokens, output_tokens = await _do_route(agent, message_text, metadata, user, db)

    content = response.get("content", "")
    task_id = f"task-{uuid.uuid4().hex[:12]}"
    context_id = f"ctx-{uuid.uuid4().hex[:12]}"

    return {
        "task": {
            "id": task_id,
            "context_id": context_id,
            "status": {"state": "TASK_STATE_COMPLETED"},
            "artifacts": [{
                "artifact_id": str(uuid.uuid4()),
                "parts": [{"text": content}],
            }],
            "metadata": {
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                },
            },
        }
    }


@router.post("/message:stream")
@router.post("/message:stream/{path_agent_id}")
async def v1_message_stream(
    request: Request,
    path_agent_id: Optional[str] = None,
    auth: tuple = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    user: User = auth[0]

    body = await request.json()
    try:
        req = A2AV1SendRequest(**body)
    except Exception as e:
        return {"error": {"code": 400, "message": f"Invalid request: {e}"}}

    if float(user.balance) < MIN_BALANCE:
        raise InsufficientBalanceError()

    message_text = _extract_text_from_v1(req)
    metadata_dict = req.message.metadata or {}

    agent_id_str = path_agent_id or metadata_dict.get("agent_id")
    agent = await _resolve_agent(db, agent_id_str)
    if not agent:
        return {"error": {"code": 404, "message": "Cannot resolve agent. Provide agent_id in metadata or URL path."}}

    request_id = str(uuid.uuid4())
    session_id = f"sess_{uuid.uuid4().hex[:12]}"

    redis: aioredis.Redis = get_redis()
    try:
        await resolve_session(redis, session_id, str(agent.id))
    finally:
        await redis.aclose()

    messages_raw = [{"role": req.message.role, "content": message_text}]
    metadata = {**metadata_dict, "messages": messages_raw}

    return EventSourceResponse(
        _v1_stream_events(
            agent=agent,
            request_id=request_id,
            session_id=session_id,
            message=message_text,
            metadata=metadata,
            user=user,
            db=db,
        )
    )


async def _v1_stream_events(agent, request_id, session_id, message, metadata, user, db):
    task_id = f"task-{uuid.uuid4().hex[:12]}"
    context_id = f"ctx-{uuid.uuid4().hex[:12]}"
    artifact_id = str(uuid.uuid4())

    yield {
        "data": json.dumps({
            "status_update": {
                "task_id": task_id,
                "context_id": context_id,
                "status": {"state": "TASK_STATE_WORKING"},
            }
        })
    }

    collected_text = ""

    async for chunk in route_to_agent_stream(
        agent_id=str(agent.id),
        request_id=request_id,
        session_id=session_id,
        message=message,
        metadata=metadata,
        endpoint_url=agent.endpoint_url,
        endpoint_api_key=agent.endpoint_api_key,
        endpoint_protocol=agent.endpoint_protocol or "openai",
    ):
        chunk_type = chunk.get("type")
        if chunk_type == "stream_chunk":
            content = chunk.get("content", "")
            collected_text += content
            yield {
                "data": json.dumps({
                    "artifact_update": {
                        "task_id": task_id,
                        "context_id": context_id,
                        "artifact": {
                            "artifact_id": artifact_id,
                            "parts": [{"text": content}],
                        },
                        "append": True,
                        "last_chunk": False,
                    }
                })
            }

        elif chunk_type == "stream_end":
            usage_data = chunk.get("usage", {})
            input_tokens = usage_data.get("input_tokens", 0)
            output_tokens = usage_data.get("output_tokens", 0)

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

    yield {
        "data": json.dumps({
            "artifact_update": {
                "task_id": task_id,
                "context_id": context_id,
                "artifact": {
                    "artifact_id": artifact_id,
                    "parts": [{"text": collected_text}],
                },
                "append": False,
                "last_chunk": True,
            }
        })
    }

    yield {
        "data": json.dumps({
            "status_update": {
                "task_id": task_id,
                "context_id": context_id,
                "status": {"state": "TASK_STATE_COMPLETED"},
            }
        })
    }
