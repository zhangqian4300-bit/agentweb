import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CapabilitySchema(BaseModel):
    name: str
    description: str
    input_schema: Optional[Dict[str, Any]] = None
    output_schema: Optional[Dict[str, Any]] = None


class AgentCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    version: str = Field(default="1.0.0", max_length=20)
    capabilities: List[CapabilitySchema] = Field(default_factory=list)
    pricing_per_million_tokens: Decimal = Field(..., gt=0)
    category: Optional[str] = Field(None, max_length=50)
    endpoint_url: Optional[str] = Field(None, max_length=500)
    endpoint_api_key: Optional[str] = Field(None, max_length=500)
    endpoint_protocol: str = Field(default="openai", pattern="^(openai|a2a)$")


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    version: Optional[str] = Field(None, max_length=20)
    capabilities: Optional[List[CapabilitySchema]] = None
    pricing_per_million_tokens: Optional[Decimal] = Field(None, gt=0)
    category: Optional[str] = Field(None, max_length=50)
    endpoint_url: Optional[str] = Field(None, max_length=500)
    endpoint_api_key: Optional[str] = Field(None, max_length=500)
    endpoint_protocol: Optional[str] = Field(None, pattern="^(openai|a2a)$")


class AgentResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: Optional[str]
    version: str
    capabilities: List[Dict[str, Any]]
    pricing_per_million_tokens: Decimal
    status: str
    category: Optional[str]
    total_calls: int
    avg_response_time_ms: int
    endpoint_url: Optional[str] = None
    endpoint_protocol: str = "openai"
    is_listed: bool
    author_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentListResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    pricing_per_million_tokens: Decimal
    status: str
    category: Optional[str]
    total_calls: int
    avg_response_time_ms: int

    model_config = {"from_attributes": True}
