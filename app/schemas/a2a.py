from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Part — supports v1.0 oneof {text, url, data} + legacy {kind, text}
# ---------------------------------------------------------------------------

class A2APart(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None
    data: Optional[Any] = None
    kind: Optional[str] = None
    media_type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Legacy JSON-RPC format (v0.1 tasks/send, tasks/sendSubscribe)
# ---------------------------------------------------------------------------

class A2AMessage(BaseModel):
    role: str = "user"
    parts: List[A2APart] = []
    metadata: Optional[Dict[str, Any]] = None


class A2AParams(BaseModel):
    id: Optional[str] = Field(None, alias="taskId")
    message: Optional[A2AMessage] = None

    model_config = {"populate_by_name": True}


class A2ARequest(BaseModel):
    jsonrpc: str = "2.0"
    id: Any = None
    method: str
    params: A2AParams


class A2AStatus(BaseModel):
    state: str


class A2AArtifact(BaseModel):
    artifact_id: Optional[str] = None
    name: Optional[str] = None
    parts: List[A2APart]
    metadata: Optional[Dict[str, Any]] = None


class A2AUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class A2ATaskResult(BaseModel):
    id: str = Field(alias="taskId")
    status: A2AStatus
    artifacts: List[A2AArtifact] = []
    usage: Optional[A2AUsage] = None

    model_config = {"populate_by_name": True}


class A2AResponse(BaseModel):
    jsonrpc: str = "2.0"
    id: Any = None
    result: A2ATaskResult


class A2AError(BaseModel):
    code: int
    message: str
    data: Optional[Any] = None


class A2AErrorResponse(BaseModel):
    jsonrpc: str = "2.0"
    id: Any = None
    error: A2AError


# ---------------------------------------------------------------------------
# v1.0 REST format (POST /message:send, /message:stream)
# ---------------------------------------------------------------------------

class A2AV1Message(BaseModel):
    message_id: str
    role: str = "user"
    parts: List[A2APart]
    context_id: Optional[str] = None
    task_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class A2AV1SendRequest(BaseModel):
    message: A2AV1Message
    configuration: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class A2AV1Task(BaseModel):
    id: str
    context_id: Optional[str] = None
    status: A2AStatus
    artifacts: List[A2AArtifact] = []
    metadata: Optional[Dict[str, Any]] = None


class A2AV1SendResponse(BaseModel):
    task: Optional[A2AV1Task] = None
    message: Optional[A2AV1Message] = None


class A2ATaskStatusUpdateEvent(BaseModel):
    task_id: str
    context_id: Optional[str] = None
    status: A2AStatus
    metadata: Optional[Dict[str, Any]] = None


class A2ATaskArtifactUpdateEvent(BaseModel):
    task_id: str
    context_id: Optional[str] = None
    artifact: A2AArtifact
    append: bool = False
    last_chunk: bool = False
    metadata: Optional[Dict[str, Any]] = None
