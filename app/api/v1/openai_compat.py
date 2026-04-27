import json
import time
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.exceptions import InsufficientBalanceError
from app.core.redis import get_redis
from app.dependencies import get_api_key_user
from app.models.agent import Agent
from app.models.user import APIKey, User
from app.schemas.openai_compat import (
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
    Choice,
    ChoiceMessage,
    ChunkChoice,
    DeltaMessage,
    ModelInfo,
    ModelListResponse,
    UsageInfo,
)
from app.services.agent_service import resolve_agent_by_model
from app.services.metering_service import record_usage
from app.services.routing_service import resolve_session, route_to_agent, route_to_agent_stream

router = APIRouter(tags=["openai-compat"])

MIN_BALANCE = 1.0


@router.get("/v1/models")
async def list_models(
    auth: tuple = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Agent)
        .where(Agent.is_listed == True, Agent.status == "online")
        .order_by(Agent.total_calls.desc())
    )
    result = await db.execute(stmt)
    agents = result.scalars().all()

    models = [
        ModelInfo(
            id=str(a.id),
            created=int(a.created_at.timestamp()),
            owned_by=str(a.owner_id),
        )
        for a in agents
    ]
    return ModelListResponse(data=models)


@router.post("/v1/chat/completions")
async def chat_completions(
    data: ChatCompletionRequest,
    auth: tuple = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    user: User = auth[0]
    api_key: APIKey = auth[1]

    if float(user.balance) < MIN_BALANCE:
        raise InsufficientBalanceError()

    agent = await resolve_agent_by_model(db, data.model)

    request_id = str(uuid.uuid4())
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    completion_id = f"chatcmpl-{request_id}"

    redis: aioredis.Redis = get_redis()
    try:
        await resolve_session(redis, session_id, str(agent.id))
    finally:
        await redis.aclose()

    messages_raw = [m.model_dump() for m in data.messages]
    message = data.messages[-1].content if data.messages else ""
    metadata = {"messages": messages_raw}

    if data.stream:
        return EventSourceResponse(
            _stream_generator(
                agent=agent,
                request_id=request_id,
                session_id=session_id,
                completion_id=completion_id,
                message=message,
                metadata=metadata,
                user=user,
                db=db,
            )
        )

    response = await route_to_agent(
        agent_id=str(agent.id),
        request_id=request_id,
        session_id=session_id,
        message=message,
        metadata=metadata,
        endpoint_url=agent.endpoint_url,
        endpoint_api_key=agent.endpoint_api_key,
        endpoint_protocol=agent.endpoint_protocol or "openai",
    )

    usage_data = response.get("usage", {})
    input_tokens = usage_data.get("input_tokens", 0)
    output_tokens = usage_data.get("output_tokens", 0)
    total_tokens = input_tokens + output_tokens

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

    return ChatCompletionResponse(
        id=completion_id,
        model=str(agent.id),
        choices=[
            Choice(message=ChoiceMessage(content=response.get("content", "")))
        ],
        usage=UsageInfo(
            prompt_tokens=input_tokens,
            completion_tokens=output_tokens,
            total_tokens=total_tokens,
        ),
    )


async def _stream_generator(
    agent, request_id, session_id, completion_id, message, metadata, user, db
):
    created = int(time.time())
    model = str(agent.id)

    yield {
        "data": ChatCompletionChunk(
            id=completion_id,
            created=created,
            model=model,
            choices=[ChunkChoice(delta=DeltaMessage(role="assistant"))],
        ).model_dump_json()
    }

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
            yield {
                "data": ChatCompletionChunk(
                    id=completion_id,
                    created=created,
                    model=model,
                    choices=[
                        ChunkChoice(delta=DeltaMessage(content=chunk.get("content", "")))
                    ],
                ).model_dump_json()
            }
        elif chunk_type == "typing":
            yield {"event": "typing", "data": json.dumps({"status": chunk.get("status", "typing")})}
        elif chunk_type == "edit":
            yield {"event": "edit", "data": json.dumps({"text": chunk.get("text", ""), "update_mode": chunk.get("update_mode", "replace")})}
        elif chunk_type == "tool_progress":
            yield {"event": "tool_progress", "data": json.dumps({"tool": chunk.get("tool", ""), "emoji": chunk.get("emoji", ""), "label": chunk.get("label", ""), "status": chunk.get("status", "running")})}
        elif chunk_type == "stream_end":
            usage = chunk.get("usage", {})
            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)

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
        "data": ChatCompletionChunk(
            id=completion_id,
            created=created,
            model=model,
            choices=[ChunkChoice(delta=DeltaMessage(), finish_reason="stop")],
        ).model_dump_json()
    }

    yield {"data": "[DONE]"}
