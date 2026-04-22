import json
import logging
import time
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_agent_key_user, get_current_user
from app.models.agent import Agent
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
from app.services.llm_service import chat_completion, chat_completion_json
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
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, json=payload, headers=headers, timeout=120.0)
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
        if e.response.status_code in (401, 403):
            raise HTTPException(status_code=422, detail="Agent 端点需要认证，请填写端点 API Key")
        raise HTTPException(status_code=422, detail=f"Agent 端点返回错误: {e.response.status_code}")
    except (json.JSONDecodeError, KeyError):
        raise HTTPException(status_code=422, detail="Agent 回复无法解析为结构化信息，请手动填写")
    except Exception:
        raise HTTPException(status_code=422, detail="无法连接到该地址，请检查 URL 和 Agent 是否在线")


_TEST_CASES_PROMPT = """\
Please provide 3-5 test cases that demonstrate your capabilities.
Return a JSON array where each element has:
- "input": the user message to test with
- "expected": a short description of the expected response behavior
- "capability": which of your capabilities this tests

Reply ONLY with the JSON array, no markdown fences, no extra text."""


_EVALUATE_PROMPT = """\
You are evaluating an AI agent's response to a test case.

Test input: {test_input}
Expected behavior: {expected}
Actual response: {response}
Response time: {time_ms}ms

Rate this response on an A/B/C/D scale:
- A: Excellent — fast (<3s), accurate, complete, matches expected behavior
- B: Good — reasonable speed (<8s), mostly matches expected behavior
- C: Average — slow or only partially matches expected behavior
- D: Poor — failed, timeout, irrelevant, or error

Return a JSON object with:
- "grade": "A", "B", "C", or "D"
- "evaluation": a brief explanation (1-2 sentences, in Chinese)

Reply ONLY with the JSON object."""


class ProbeRequest(BaseModel):
    endpoint_url: str = Field(..., max_length=500)
    endpoint_api_key: Optional[str] = Field(None, max_length=500)


class RunTestRequest(BaseModel):
    endpoint_url: str = Field(..., max_length=500)
    endpoint_api_key: Optional[str] = Field(None, max_length=500)
    test_input: str
    expected: str


class SuggestPricingRequest(BaseModel):
    category: str
    grades: List[str]


@router.post("/probe")
async def probe_agent(data: ProbeRequest) -> Dict[str, Any]:
    url = _build_url(data.endpoint_url)
    headers = {"Content-Type": "application/json"}
    if data.endpoint_api_key:
        headers["Authorization"] = f"Bearer {data.endpoint_api_key}"

    payload = {
        "model": "default",
        "messages": [{"role": "user", "content": _TEST_CASES_PROMPT}],
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers, timeout=120.0)
            resp.raise_for_status()
            raw = resp.json()

        content = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        test_cases = json.loads(content)

        if not isinstance(test_cases, list):
            test_cases = [test_cases]

        return {"test_cases": test_cases}

    except httpx.TimeoutException:
        raise HTTPException(status_code=422, detail="Agent 端点超时")
    except (json.JSONDecodeError, KeyError):
        raise HTTPException(status_code=422, detail="Agent 返回的测试用例无法解析")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"探测失败: {str(e)}")


@router.post("/run-test")
async def run_test(data: RunTestRequest) -> Dict[str, Any]:
    url = _build_url(data.endpoint_url)
    headers = {"Content-Type": "application/json"}
    if data.endpoint_api_key:
        headers["Authorization"] = f"Bearer {data.endpoint_api_key}"

    payload = {
        "model": "default",
        "messages": [{"role": "user", "content": data.test_input}],
        "stream": False,
    }

    start = time.monotonic()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers=headers, timeout=180.0)
            resp.raise_for_status()
            raw = resp.json()
        elapsed_ms = int((time.monotonic() - start) * 1000)

        content = raw.get("choices", [{}])[0].get("message", {}).get("content", "")

        evaluation = await chat_completion_json([
            {
                "role": "user",
                "content": _EVALUATE_PROMPT.format(
                    test_input=data.test_input,
                    expected=data.expected,
                    response=content[:2000],
                    time_ms=elapsed_ms,
                ),
            }
        ])

        return {
            "grade": evaluation.get("grade", "D"),
            "response_content": content,
            "response_time_ms": elapsed_ms,
            "evaluation": evaluation.get("evaluation", ""),
        }

    except httpx.TimeoutException:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "grade": "D",
            "response_content": "",
            "response_time_ms": elapsed_ms,
            "evaluation": "Agent 响应超时",
        }
    except Exception as e:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "grade": "D",
            "response_content": "",
            "response_time_ms": elapsed_ms,
            "evaluation": f"调用失败: {str(e)}",
        }


@router.post("/suggest-pricing")
async def suggest_pricing(
    data: SuggestPricingRequest,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    grade_scores = {"A": 4, "B": 3, "C": 2, "D": 1}
    scores = [grade_scores.get(g.upper(), 1) for g in data.grades]
    avg_score = sum(scores) / len(scores) if scores else 2
    quality_factor = avg_score / 3.0

    count_stmt = (
        select(func.count(Agent.id))
        .where(Agent.is_listed == True, Agent.category == data.category)
    )
    avg_stmt = (
        select(func.avg(Agent.pricing_per_million_tokens))
        .where(Agent.is_listed == True, Agent.category == data.category)
    )

    count_result = await db.execute(count_stmt)
    similar_count = count_result.scalar() or 0

    avg_result = await db.execute(avg_stmt)
    category_avg = float(avg_result.scalar() or 10)

    if similar_count == 0:
        scarcity = "high"
        scarcity_bonus = 0.3
    elif similar_count <= 3:
        scarcity = "medium"
        scarcity_bonus = 0.1
    else:
        scarcity = "low"
        scarcity_bonus = 0.0

    base_price = category_avg if category_avg > 0 else 10
    suggested = base_price * quality_factor * (1 + scarcity_bonus)
    suggested_low = round(max(1, suggested * 0.8), 1)
    suggested_high = round(max(2, suggested * 1.2), 1)

    grade_label = {4: "A", 3: "B+", 2.5: "B", 2: "C+", 1.5: "C", 1: "D"}.get(
        avg_score, f"{avg_score:.1f}"
    )
    for threshold, label in [(3.5, "A"), (2.8, "B+"), (2.3, "B"), (1.8, "C+"), (1.3, "C")]:
        if avg_score >= threshold:
            grade_label = label
            break
    else:
        grade_label = "D"

    scarcity_text = {"high": "高", "medium": "中", "low": "低"}[scarcity]
    reasoning = (
        f"同类 Agent {similar_count} 个，稀缺度{scarcity_text}，"
        f"评测综合评分 {grade_label}，"
        f"建议定价 {suggested_low}-{suggested_high} 元/百万tokens"
    )

    return {
        "suggested_low": suggested_low,
        "suggested_high": suggested_high,
        "category_avg": round(category_avg, 1),
        "similar_count": similar_count,
        "scarcity": scarcity,
        "reasoning": reasoning,
    }


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


_SMART_SEARCH_PROMPT = """\
用户在一个 AI Agent 市场中搜索，描述了自己的问题：
"{query}"

平台当前的 Agent 分类有：文献与知识, 数据与计算, 生命科学, 化学与材料, 物理与工程, 地球与环境, 数学与AI, 写作与协作

请分析用户需求，返回 JSON 对象：
{{
  "understanding": "用中文简短概括用户需求(1-2句)",
  "keywords": ["关键词1", "关键词2", ...],
  "suggested_category": "最匹配的分类名",
  "capability_needs": ["需要的能力1", "需要的能力2"]
}}

仅返回 JSON。"""


_MATCH_REASON_PROMPT = """\
用户需求：{query}
Agent 名称：{name}
Agent 描述：{description}
Agent 能力：{capabilities}

请用中文一句话说明这个 Agent 为什么适合该用户（或不适合的话说明原因），并给出 0-1 之间的相关度分数。

返回 JSON：{{"match_reason": "...", "relevance": 0.85}}
仅返回 JSON。"""


class SmartSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)


@router.post("/smart-search")
async def smart_search(
    data: SmartSearchRequest,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    analysis = await chat_completion_json([
        {"role": "user", "content": _SMART_SEARCH_PROMPT.format(query=data.query)}
    ])

    keywords = analysis.get("keywords", [])
    suggested_category = analysis.get("suggested_category")

    agents_by_category, _ = await list_agents(
        db,
        category=suggested_category if suggested_category != "其他" else None,
        page=1,
        page_size=10,
        sort="calls",
    )

    if len(agents_by_category) < 3 and keywords:
        for kw in keywords[:3]:
            extra, _ = await list_agents(db, query=kw, page=1, page_size=5, sort="calls")
            seen_ids = {a.id for a in agents_by_category}
            for a in extra:
                if a.id not in seen_ids:
                    agents_by_category.append(a)
                    seen_ids.add(a.id)
            if len(agents_by_category) >= 10:
                break

    recommendations = []
    for agent in agents_by_category[:6]:
        caps_text = ", ".join(
            c.get("name", "") for c in (agent.capabilities or [])
        )
        try:
            match_info = await chat_completion_json([{
                "role": "user",
                "content": _MATCH_REASON_PROMPT.format(
                    query=data.query,
                    name=agent.name,
                    description=agent.description or "",
                    capabilities=caps_text or "未声明",
                ),
            }])
        except Exception:
            match_info = {"match_reason": "可能相关", "relevance": 0.5}

        agent_data = AgentListResponse.model_validate(agent).model_dump()
        recommendations.append({
            "agent": agent_data,
            "match_reason": match_info.get("match_reason", ""),
            "relevance": match_info.get("relevance", 0.5),
        })

    recommendations.sort(key=lambda x: x["relevance"], reverse=True)

    return {
        "understanding": analysis.get("understanding", ""),
        "recommendations": recommendations,
        "suggested_category": suggested_category,
    }
