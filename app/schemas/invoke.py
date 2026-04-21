from typing import Any, Dict, Optional

from pydantic import BaseModel


class InvokeRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    stream: bool = False
    metadata: Dict[str, Any] = {}


class UsageInfo(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class CostInfo(BaseModel):
    amount: float
    currency: str = "CNY"


class InvokeResponse(BaseModel):
    request_id: str
    session_id: str
    response: str
    usage: UsageInfo
    cost: CostInfo
