import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class UsageRecordResponse(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    agent_id: uuid.UUID
    session_id: Optional[str]
    input_tokens: int
    output_tokens: int
    total_tokens: int
    total_cost: Decimal
    platform_fee: Decimal
    provider_earning: Decimal
    response_time_ms: Optional[int]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
