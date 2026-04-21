from datetime import date, datetime, time, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.agent import Agent
from app.models.usage import UsageRecord
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.usage import UsageRecordResponse

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("", response_model=PaginatedResponse[UsageRecordResponse])
async def list_usage(
    role: str = Query("consumer", pattern="^(consumer|provider)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    agent_name: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if role == "consumer":
        filter_cond = UsageRecord.consumer_id == user.id
    else:
        filter_cond = UsageRecord.provider_id == user.id

    conditions = [filter_cond]

    if start_date:
        start_dt = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        conditions.append(UsageRecord.created_at >= start_dt)
    if end_date:
        end_dt = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        conditions.append(UsageRecord.created_at <= end_dt)

    if agent_name:
        sub = select(Agent.id).where(Agent.name.ilike(f"%{agent_name}%"))
        conditions.append(UsageRecord.agent_id.in_(sub))

    where = and_(*conditions)

    count_stmt = select(func.count(UsageRecord.id)).where(where)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(UsageRecord)
        .where(where)
        .order_by(UsageRecord.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    return PaginatedResponse(items=records, total=total, page=page, page_size=page_size)
