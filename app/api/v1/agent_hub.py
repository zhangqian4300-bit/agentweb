import logging
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.core.security import decrypt_api_key
from app.dependencies import get_current_user
from app.models.agent import Agent
from app.models.user import APIKey, User
from app.services.auth_service import create_api_key
from app.ws.connection_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent-hub", tags=["agent-hub"])


@router.get("/status")
async def hub_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    listed_stmt = (
        select(Agent)
        .where(Agent.owner_id == user.id, Agent.is_listed == True)
        .order_by(Agent.created_at.desc())
        .limit(1)
    )
    result = await db.execute(listed_stmt)
    listed = result.scalar_one_or_none()
    if listed:
        online = manager.is_online(str(listed.id))
        return {
            "status": "online" if online else "offline",
            "agent_id": str(listed.id),
            "name": listed.name,
        }

    unlisted_stmt = (
        select(Agent)
        .where(Agent.owner_id == user.id, Agent.is_listed == False)
        .order_by(Agent.created_at.desc())
        .limit(1)
    )
    result = await db.execute(unlisted_stmt)
    pending = result.scalar_one_or_none()
    if pending:
        online = manager.is_online(str(pending.id))
        return {
            "status": "pending_review",
            "connected": online,
            "agent_id": str(pending.id),
            "name": pending.name,
            "description": pending.description,
            "category": pending.category,
            "pricing": float(pending.pricing_per_million_tokens),
            "capabilities": pending.capabilities,
        }

    return {"status": "not_connected"}


@router.get("/sdk-snippet")
async def sdk_snippet(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(APIKey).where(
        APIKey.user_id == user.id,
        APIKey.key_type == "agent_key",
        APIKey.is_active == True,
        APIKey.encrypted_key.isnot(None),
    ).order_by(APIKey.created_at.asc()).limit(1)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        agent_key = decrypt_api_key(existing.encrypted_key)
    else:
        _, agent_key = await create_api_key(db, user.id, "agent_key", "sdk-default")

    platform_url = (settings.backend_url or settings.site_url).rstrip("/")

    snippet = f"""\
pip install agentweb-sdk

from agentweb_sdk import AgentWebPlugin

plugin = AgentWebPlugin(
    platform_url="{platform_url}",
    agent_key="{agent_key}"
)

# 可选：接入已有 HTTP Agent
# from agentweb_sdk import HTTPAdapter
# plugin.use_adapter(HTTPAdapter("http://your-agent:8000"))

plugin.run()"""

    return {
        "agent_key": agent_key,
        "platform_url": platform_url,
        "snippet": snippet,
    }
