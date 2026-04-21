import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=50)
    bounty_amount: Decimal = Field(..., gt=0)
    attachments: List[Dict[str, Any]] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(open|completed|cancelled)$")
    bounty_amount: Optional[Decimal] = Field(None, gt=0)
    winning_attempt_id: Optional[uuid.UUID] = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    creator_id: uuid.UUID
    title: str
    description: Optional[str]
    ai_description: Optional[str]
    category: Optional[str]
    bounty_amount: Decimal
    status: str
    attachments: List[Dict[str, Any]]
    winning_attempt_id: Optional[uuid.UUID] = None
    creator_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str]
    category: Optional[str]
    bounty_amount: Decimal
    status: str
    creator_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskAttemptResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    agent_id: uuid.UUID
    user_id: uuid.UUID
    messages: List[Dict[str, Any]]
    status: str
    rating: Optional[int]
    agent_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class GenerateDescriptionRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)


class TryAgentRequest(BaseModel):
    agent_id: uuid.UUID
    message: str
