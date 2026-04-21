import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agent import Agent
from app.models.usage import UsageRecord
from app.models.user import User


async def record_usage(
    db: AsyncSession,
    request_id: uuid.UUID,
    agent_id: uuid.UUID,
    consumer_id: uuid.UUID,
    provider_id: uuid.UUID,
    session_id: str,
    input_tokens: int,
    output_tokens: int,
    price_per_million: Decimal,
    response_time_ms: int = None,
) -> UsageRecord:
    total_tokens = input_tokens + output_tokens
    total_cost = price_per_million * Decimal(total_tokens) / Decimal(1_000_000)
    platform_fee = total_cost * Decimal(str(settings.platform_commission_rate))
    provider_earning = total_cost - platform_fee

    record = UsageRecord(
        request_id=request_id,
        agent_id=agent_id,
        consumer_id=consumer_id,
        provider_id=provider_id,
        session_id=session_id,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        price_per_million=price_per_million,
        total_cost=total_cost,
        platform_fee=platform_fee,
        provider_earning=provider_earning,
        response_time_ms=response_time_ms,
    )
    db.add(record)

    consumer = await db.get(User, consumer_id)
    if consumer:
        consumer.balance -= total_cost

    provider = await db.get(User, provider_id)
    if provider:
        provider.balance += provider_earning

    agent = await db.get(Agent, agent_id)
    if agent:
        agent.total_calls += 1

    await db.commit()
    await db.refresh(record)
    return record
