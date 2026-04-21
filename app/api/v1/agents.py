import json
import logging
import uuid
from typing import Any, Dict, Optional
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_agent_key_user, get_current_user
from app.models.user import User
from app.schemas.agent import AgentCreate, AgentListResponse, AgentResponse, AgentUpdate
from app.schemas.common import PaginatedResponse
from app.services.agent_service import (
    create_agent,
    delete_agent,
    get_agent,
    list_agents,
    list_my_agents,
    register_agent,
    update_agent,
)
from app.services.webhook_service import _build_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])

_SELF_INTRO_PROMPT = """\
Please describe yourself as a JSON object with these fields:
- "name": your name (short, 2-5 words)
- "description": what you can do (1-2 sentences)
- "version": your version string, default "1.0.0"
- "capabilities": array of objects, each with "name" and "description"

Reply ONLY with the JSON object, no markdown fences, no extra text."""


class FetchCardRequest(BaseModel):
    endpoint_url: str = Field(..., max_length=500)
    endpoint_api_key: Optional[str] = Field(None, max_length=500)


def _extract_base_url(endpoint_url: str) -> str:
    url = endpoint_url.rstrip("/")
    for suffix in ["/v1/chat/completions", "/chat/completions"]:
        if url.endswith(suffix):
            return url[: -len(suffix)]
    return url


async def _fetch_via_agent_json(base_url: str) -> Optional[Dict[str, Any]]:
    card_url = f"{base_url}/.well-known/agent.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(card_url)
        resp.raise_for_status()
        return resp.json()


async def _fetch_via_self_intro(
    endpoint_url: str, endpoint_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    url = _build_url(endpoint_url)
    headers = {"Content-Type": "application/json"}
    if endpoint_api_key:
        headers["Authorization"] = f"Bearer {endpoint_api_key}"
    payload = {
        "model": "default",
        "messages": [{"role": "user", "content": _SELF_INTRO_PROMPT}],
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=headers, timeout=30.0)
        resp.raise_for_status()
        data = resp.json()

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    return json.loads(content)


@router.post("/fetch-card")
async def fetch_agent_card(
    data: FetchCardRequest,
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    base_url = _extract_base_url(data.endpoint_url)

    try:
        return await _fetch_via_agent_json(base_url)
    except Exception:
        pass

    try:
        result = await _fetch_via_self_intro(data.endpoint_url, data.endpoint_api_key)
        result["_source"] = "self_intro"
        return result
    except httpx.TimeoutException:
        raise HTTPException(status_code=422, detail="连接超时，请检查 Agent 端点是否可达")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=422, detail=f"Agent 端点返回错误: {e.response.status_code}")
    except (json.JSONDecodeError, KeyError):
        raise HTTPException(status_code=422, detail="Agent 回复无法解析为结构化信息，请手动填写")
    except Exception:
        raise HTTPException(status_code=422, detail="无法连接到该地址，请检查 URL 和 Agent 是否在线")


async def _with_author(agent, db: AsyncSession) -> dict:
    data = AgentResponse.model_validate(agent).model_dump()
    stmt = select(User.display_name).where(User.id == agent.owner_id)
    result = await db.execute(stmt)
    name = result.scalar_one_or_none()
    data["author_name"] = name or "匿名开发者"
    return data


@router.post("/register", response_model=AgentResponse)
async def register(
    data: AgentCreate,
    auth: tuple = Depends(get_agent_key_user),
    db: AsyncSession = Depends(get_db),
):
    user: User = auth[0]
    agent = await register_agent(db, user.id, data)
    return await _with_author(agent, db)


@router.post("", response_model=AgentResponse)
async def create(
    data: AgentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await create_agent(db, user.id, data)
    return await _with_author(agent, db)


@router.get("/mine", response_model=PaginatedResponse[AgentResponse])
async def list_mine(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agents, total = await list_my_agents(db, user.id, page, page_size)
    items = []
    for a in agents:
        d = AgentResponse.model_validate(a).model_dump()
        d["author_name"] = user.display_name or "匿名开发者"
        items.append(d)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("", response_model=PaginatedResponse[AgentListResponse])
async def list_all(
    category: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("calls", pattern="^(calls|price|newest)$"),
    db: AsyncSession = Depends(get_db),
):
    agents, total = await list_agents(db, category, q, status, page, page_size, sort)
    return PaginatedResponse(items=agents, total=total, page=page, page_size=page_size)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_one(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    agent = await get_agent(db, agent_id)
    return await _with_author(agent, db)


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update(
    agent_id: uuid.UUID,
    data: AgentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await update_agent(db, agent_id, user.id, data)
    return await _with_author(agent, db)


@router.delete("/{agent_id}")
async def delete(
    agent_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_agent(db, agent_id, user.id)
    return {"detail": "Agent unlisted"}
