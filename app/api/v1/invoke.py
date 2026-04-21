import json
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.exceptions import AgentOfflineError, InsufficientBalanceError
from app.core.redis import get_redis
from app.dependencies import get_api_key_user
from app.models.user import APIKey, User
from app.schemas.invoke import CostInfo, InvokeRequest, InvokeResponse, UsageInfo
from app.services.agent_service import get_agent
from app.services.routing_service import resolve_session, route_to_agent, route_to_agent_stream

router = APIRouter(tags=["invoke"])

MIN_BALANCE = 1.0


@router.post("/agent/{agent_id}/invoke")
async def invoke_agent(
    agent_id: uuid.UUID,
    data: InvokeRequest,
    auth: tuple = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    user: User = auth[0]
    api_key: APIKey = auth[1]

    if float(user.balance) < MIN_BALANCE:
        raise InsufficientBalanceError()

    agent = await get_agent(db, agent_id)

    request_id = str(uuid.uuid4())
    session_id = data.session_id or f"sess_{uuid.uuid4().hex[:12]}"

    redis: aioredis.Redis = get_redis()
    try:
        await resolve_session(redis, session_id, str(agent_id))
    finally:
        await redis.aclose()

    if data.stream:
        return EventSourceResponse(
            _stream_generator(
                str(agent_id), request_id, session_id, data, user, agent, db
            )
        )

    response = await route_to_agent(
        agent_id=str(agent_id),
        request_id=request_id,
        session_id=session_id,
        message=data.message,
        metadata=data.metadata,
        endpoint_url=agent.endpoint_url,
        endpoint_api_key=agent.endpoint_api_key,
    )

    usage_data = response.get("usage", {})
    input_tokens = usage_data.get("input_tokens", 0)
    output_tokens = usage_data.get("output_tokens", 0)
    total_tokens = input_tokens + output_tokens
    cost = float(agent.pricing_per_million_tokens) * total_tokens / 1_000_000

    from app.services.metering_service import record_usage

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

    return InvokeResponse(
        request_id=request_id,
        session_id=session_id,
        response=response.get("content", ""),
        usage=UsageInfo(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        ),
        cost=CostInfo(amount=round(cost, 6)),
    )


async def _stream_generator(agent_id, request_id, session_id, data, user, agent, db):
    total_content = ""
    final_usage = {}

    async for chunk in route_to_agent_stream(
        agent_id=agent_id,
        request_id=request_id,
        session_id=session_id,
        message=data.message,
        metadata=data.metadata,
        endpoint_url=agent.endpoint_url,
        endpoint_api_key=agent.endpoint_api_key,
    ):
        chunk_type = chunk.get("type")
        if chunk_type == "stream_chunk":
            total_content += chunk.get("content", "")
            yield {"event": "chunk", "data": json.dumps({"content": chunk.get("content", "")})}
        elif chunk_type == "stream_end":
            final_usage = chunk.get("usage", {})
            input_tokens = final_usage.get("input_tokens", 0)
            output_tokens = final_usage.get("output_tokens", 0)
            total_tokens = input_tokens + output_tokens
            cost = float(agent.pricing_per_million_tokens) * total_tokens / 1_000_000

            from app.services.metering_service import record_usage

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
                "event": "done",
                "data": json.dumps({
                    "request_id": request_id,
                    "usage": {
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "total_tokens": total_tokens,
                    },
                    "cost": {"amount": round(cost, 6), "currency": "CNY"},
                }),
            }
