from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.agent import Agent
from app.models.usage import UsageRecord
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardStats(BaseModel):
    agent_count: int
    total_calls: int
    total_spent: str
    total_earned: str
    today_spent: str
    today_earned: str


class RecentCall(BaseModel):
    id: str
    agent_id: str
    agent_name: Optional[str]
    endpoint: str
    status: str
    latency_ms: Optional[int]
    created_at: datetime


class DashboardData(BaseModel):
    stats: DashboardStats
    recent_calls: List[RecentCall]


@router.get("/stats", response_model=DashboardData)
async def get_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent_count_stmt = select(func.count(Agent.id)).where(Agent.owner_id == user.id)
    result = await db.execute(agent_count_stmt)
    agent_count = result.scalar() or 0

    calls_stmt = select(func.coalesce(func.sum(Agent.total_calls), 0)).where(
        Agent.owner_id == user.id
    )
    result = await db.execute(calls_stmt)
    total_calls = result.scalar() or 0

    spent_stmt = select(func.coalesce(func.sum(UsageRecord.total_cost), Decimal(0))).where(
        UsageRecord.consumer_id == user.id
    )
    result = await db.execute(spent_stmt)
    total_spent = result.scalar() or Decimal(0)

    earned_stmt = select(
        func.coalesce(func.sum(UsageRecord.provider_earning), Decimal(0))
    ).where(UsageRecord.provider_id == user.id)
    result = await db.execute(earned_stmt)
    total_earned = result.scalar() or Decimal(0)

    today_start = datetime.combine(date.today(), time.min, tzinfo=timezone.utc)

    today_spent_stmt = select(
        func.coalesce(func.sum(UsageRecord.total_cost), Decimal(0))
    ).where(
        and_(UsageRecord.consumer_id == user.id, UsageRecord.created_at >= today_start)
    )
    result = await db.execute(today_spent_stmt)
    today_spent = result.scalar() or Decimal(0)

    today_earned_stmt = select(
        func.coalesce(func.sum(UsageRecord.provider_earning), Decimal(0))
    ).where(
        and_(UsageRecord.provider_id == user.id, UsageRecord.created_at >= today_start)
    )
    result = await db.execute(today_earned_stmt)
    today_earned = result.scalar() or Decimal(0)

    recent_stmt = (
        select(UsageRecord)
        .where(
            (UsageRecord.consumer_id == user.id) | (UsageRecord.provider_id == user.id)
        )
        .order_by(UsageRecord.created_at.desc())
        .limit(5)
    )
    result = await db.execute(recent_stmt)
    records = result.scalars().all()

    agent_ids = list({r.agent_id for r in records})
    agent_names: Dict[str, str] = {}
    if agent_ids:
        name_stmt = select(Agent.id, Agent.name).where(Agent.id.in_(agent_ids))
        name_result = await db.execute(name_stmt)
        for row in name_result:
            agent_names[str(row[0])] = row[1]

    recent_calls = [
        RecentCall(
            id=str(r.id),
            agent_id=str(r.agent_id),
            agent_name=agent_names.get(str(r.agent_id)),
            endpoint="/v1/chat/completions",
            status=r.status,
            latency_ms=r.response_time_ms,
            created_at=r.created_at,
        )
        for r in records
    ]

    return DashboardData(
        stats=DashboardStats(
            agent_count=agent_count,
            total_calls=int(total_calls),
            total_spent=str(total_spent),
            total_earned=str(total_earned),
            today_spent=str(today_spent),
            today_earned=str(today_earned),
        ),
        recent_calls=recent_calls,
    )
