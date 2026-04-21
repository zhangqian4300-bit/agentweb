import uuid
from typing import List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentUpdate


async def register_agent(db: AsyncSession, owner_id: uuid.UUID, data: AgentCreate) -> Agent:
    stmt = select(Agent).where(Agent.owner_id == owner_id, Agent.name == data.name)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.description = data.description
        existing.version = data.version
        existing.capabilities = [c.dict() for c in data.capabilities]
        existing.pricing_per_million_tokens = data.pricing_per_million_tokens
        existing.category = data.category
        existing.endpoint_url = data.endpoint_url
        existing.endpoint_api_key = data.endpoint_api_key
        existing.is_listed = True
        if data.endpoint_url:
            existing.status = "online"
        await db.commit()
        await db.refresh(existing)
        return existing

    return await create_agent(db, owner_id, data)


async def create_agent(db: AsyncSession, owner_id: uuid.UUID, data: AgentCreate) -> Agent:
    caps = [c.dict() for c in data.capabilities]
    agent = Agent(
        owner_id=owner_id,
        name=data.name,
        description=data.description,
        version=data.version,
        capabilities=caps,
        pricing_per_million_tokens=data.pricing_per_million_tokens,
        category=data.category,
        endpoint_url=data.endpoint_url,
        endpoint_api_key=data.endpoint_api_key,
        status="online" if data.endpoint_url else "offline",
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def get_agent(db: AsyncSession, agent_id: uuid.UUID) -> Agent:
    stmt = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    if not agent:
        raise NotFoundError("Agent not found")
    return agent


async def update_agent(
    db: AsyncSession, agent_id: uuid.UUID, owner_id: uuid.UUID, data: AgentUpdate
) -> Agent:
    agent = await get_agent(db, agent_id)
    if agent.owner_id != owner_id:
        raise ForbiddenError("Not the owner of this agent")

    update_data = data.dict(exclude_unset=True)
    if "capabilities" in update_data:
        update_data["capabilities"] = [c.dict() for c in data.capabilities]
    for key, value in update_data.items():
        setattr(agent, key, value)

    if "endpoint_url" in update_data and update_data["endpoint_url"]:
        agent.status = "online"

    await db.commit()
    await db.refresh(agent)
    return agent


async def delete_agent(db: AsyncSession, agent_id: uuid.UUID, owner_id: uuid.UUID) -> None:
    agent = await get_agent(db, agent_id)
    if agent.owner_id != owner_id:
        raise ForbiddenError("Not the owner of this agent")
    agent.is_listed = False
    await db.commit()


async def list_my_agents(
    db: AsyncSession,
    owner_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
) -> Tuple[List[Agent], int]:
    base = select(Agent).where(Agent.owner_id == owner_id)
    count_stmt = select(func.count(Agent.id)).where(Agent.owner_id == owner_id)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base.order_by(Agent.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    agents = result.scalars().all()
    return list(agents), total


async def list_agents(
    db: AsyncSession,
    category: Optional[str] = None,
    query: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    sort: str = "calls",
) -> Tuple[List[Agent], int]:
    stmt = select(Agent).where(Agent.is_listed == True)
    count_stmt = select(func.count(Agent.id)).where(Agent.is_listed == True)

    if category:
        stmt = stmt.where(Agent.category == category)
        count_stmt = count_stmt.where(Agent.category == category)
    if query:
        pattern = f"%{query}%"
        filter_cond = or_(Agent.name.ilike(pattern), Agent.description.ilike(pattern))
        stmt = stmt.where(filter_cond)
        count_stmt = count_stmt.where(filter_cond)
    if status:
        stmt = stmt.where(Agent.status == status)
        count_stmt = count_stmt.where(Agent.status == status)

    if sort == "calls":
        stmt = stmt.order_by(Agent.total_calls.desc())
    elif sort == "price":
        stmt = stmt.order_by(Agent.pricing_per_million_tokens.asc())
    elif sort == "newest":
        stmt = stmt.order_by(Agent.created_at.desc())

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    agents = result.scalars().all()

    return list(agents), total
