import json
import os
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.agent import Agent
from app.models.task import Task, TaskAttempt
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.task import (
    GenerateDescriptionRequest,
    TaskAttemptResponse,
    TaskCreate,
    TaskListResponse,
    TaskResponse,
    TaskUpdate,
    TryAgentRequest,
)
from app.config import settings
from app.core.security import decode_token
from app.services.llm_service import chat_completion, chat_completion_json
from app.services.webhook_service import webhook_invoke

def _build_attachment_text(attachments: list) -> str:
    if not attachments:
        return ""
    base = settings.site_url.rstrip("/")
    lines = ["\n\n附件（可通过 HTTP GET 直接下载）："]
    for att in attachments:
        if not isinstance(att, dict):
            continue
        filename = att.get("filename", "")
        url = att.get("url", "")
        if not url:
            continue
        full_url = att.get("download_url") or f"{base}{url}"
        lines.append(f"- {filename}: {full_url}")
    return "\n".join(lines)

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def _get_optional_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = payload["sub"]
    except Exception:
        return None
    stmt = select(User).where(User.id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


_GENERATE_DESC_PROMPT = """\
用户在一个 AI Agent 市场上想发布一个悬赏任务，他描述了自己的问题：
"{query}"

请帮他生成一个结构化的任务描述，返回 JSON：
{{
  "title": "任务标题（简洁，10-20字）",
  "description": "详细的任务描述（包含背景、需求、期望输出，100-300字）",
  "category": "从以下分类选一个最匹配的：文献与知识/数据与计算/生命科学/化学与材料/物理与工程/地球与环境/数学与AI/写作与协作/其他",
  "suggested_bounty": 一个建议的悬赏金额数字（单位元，根据任务复杂度建议10-500）
}}

仅返回 JSON。"""


@router.post("/generate-description")
async def generate_description(data: GenerateDescriptionRequest) -> Dict[str, Any]:
    result = await chat_completion_json([
        {"role": "user", "content": _GENERATE_DESC_PROMPT.format(query=data.query)}
    ])
    return result


async def _with_creator(task: Task, db: AsyncSession) -> dict:
    data = TaskResponse.model_validate(task).model_dump()
    stmt = select(User.display_name).where(User.id == task.creator_id)
    result = await db.execute(stmt)
    name = result.scalar_one_or_none()
    data["creator_name"] = name or "匿名用户"
    return data


@router.post("", response_model=TaskResponse)
async def create_task(
    data: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from decimal import Decimal as D
    amount = D(str(data.bounty_amount))
    if user.balance < amount:
        raise HTTPException(status_code=402, detail="余额不足，无法发布悬赏")

    user.balance -= amount

    ai_desc = None
    if data.description:
        try:
            refined = await chat_completion([
                {
                    "role": "user",
                    "content": f"请润色以下任务描述，使其更专业清晰，保持原意，不要添加无关内容，直接输出润色后的文本：\n\n{data.description}",
                }
            ])
            ai_desc = refined.strip()
        except Exception:
            ai_desc = None

    task = Task(
        creator_id=user.id,
        title=data.title,
        description=data.description,
        ai_description=ai_desc,
        category=data.category,
        bounty_amount=data.bounty_amount,
        attachments=data.attachments,
        status="open",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return await _with_creator(task, db)


@router.get("", response_model=PaginatedResponse[TaskListResponse])
async def list_tasks(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("newest", pattern="^(newest|bounty)$"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Task)
    count_stmt = select(func.count(Task.id))

    if category:
        stmt = stmt.where(Task.category == category)
        count_stmt = count_stmt.where(Task.category == category)
    if status:
        stmt = stmt.where(Task.status == status)
        count_stmt = count_stmt.where(Task.status == status)

    if sort == "bounty":
        stmt = stmt.order_by(Task.bounty_amount.desc())
    else:
        stmt = stmt.order_by(Task.created_at.desc())

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    tasks = result.scalars().all()

    items = []
    for t in tasks:
        d = TaskListResponse.model_validate(t).model_dump()
        creator_stmt = select(User.display_name).where(User.id == t.creator_id)
        cr = await db.execute(creator_stmt)
        d["creator_name"] = cr.scalar_one_or_none() or "匿名用户"
        items.append(d)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = select(Task).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return await _with_creator(task, db)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Task).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.creator_id != user.id:
        raise HTTPException(status_code=403, detail="无权修改此任务")

    if task.status != "open":
        raise HTTPException(status_code=422, detail="只有进行中的任务可以修改")

    update_data = data.model_dump(exclude_unset=True)

    if data.winning_attempt_id and data.status == "completed":
        attempt_stmt = select(TaskAttempt).where(
            TaskAttempt.id == data.winning_attempt_id,
            TaskAttempt.task_id == task_id,
        )
        attempt_result = await db.execute(attempt_stmt)
        attempt = attempt_result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=404, detail="该尝试记录不存在")
        winner = await db.get(User, attempt.user_id)
        if winner:
            winner.balance += task.bounty_amount

    if data.status == "cancelled":
        creator = await db.get(User, task.creator_id)
        if creator:
            creator.balance += task.bounty_amount

    for key, value in update_data.items():
        setattr(task, key, value)
    await db.commit()
    await db.refresh(task)
    return await _with_creator(task, db)


@router.post("/{task_id}/try")
async def try_agent_on_task(
    task_id: uuid.UUID,
    data: TryAgentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_stmt = select(Task).where(Task.id == task_id)
    task_result = await db.execute(task_stmt)
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    agent_stmt = select(Agent).where(Agent.id == data.agent_id)
    agent_result = await db.execute(agent_stmt)
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    if agent.status != "online":
        raise HTTPException(status_code=422, detail="Agent 当前不在线")
    if not agent.endpoint_url:
        raise HTTPException(status_code=422, detail="Agent 没有配置端点")

    attachment_text = _build_attachment_text(task.attachments)

    context = f"任务标题：{task.title}\n任务描述：{task.ai_description or task.description or ''}{attachment_text}\n\n用户消息：{data.message}"

    request_id = str(uuid.uuid4())
    try:
        result = await webhook_invoke(
            endpoint_url=agent.endpoint_url,
            request_id=request_id,
            session_id=f"task_{task_id}",
            message=context,
            metadata={},
            endpoint_api_key=agent.endpoint_api_key,
            timeout=60.0,
        )
        response_content = result.get("content", "")
    except Exception as e:
        response_content = f"调用失败: {str(e)}"

    attempt = TaskAttempt(
        task_id=task_id,
        agent_id=data.agent_id,
        user_id=user.id,
        messages=[
            {"role": "user", "content": data.message},
            {"role": "assistant", "content": response_content},
        ],
        status="completed",
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)

    return {
        "id": str(attempt.id),
        "response": response_content,
        "agent_name": agent.name,
    }


@router.get("/{task_id}/attempts", response_model=List[TaskAttemptResponse])
async def list_attempts(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(_get_optional_user),
):
    task_stmt = select(Task).where(Task.id == task_id)
    task_result = await db.execute(task_stmt)
    task = task_result.scalar_one_or_none()

    stmt = select(TaskAttempt).where(TaskAttempt.task_id == task_id).order_by(TaskAttempt.created_at.desc())
    result = await db.execute(stmt)
    attempts = result.scalars().all()

    is_task_owner = user and task and task.creator_id == user.id

    items = []
    for a in attempts:
        d = TaskAttemptResponse.model_validate(a).model_dump()
        agent_stmt = select(Agent.name).where(Agent.id == a.agent_id)
        ar = await db.execute(agent_stmt)
        d["agent_name"] = ar.scalar_one_or_none() or "未知 Agent"

        is_attempt_owner = user and a.user_id == user.id
        if not is_task_owner and not is_attempt_owner:
            truncated = []
            for msg in d.get("messages", []):
                content = msg.get("content", "")
                if len(content) > 80:
                    content = content[:80] + "..."
                truncated.append({**msg, "content": content})
            d["messages"] = truncated

        items.append(d)

    return items
