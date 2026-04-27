from typing import Any, Dict, Optional

from pydantic import BaseModel


class WSMessage(BaseModel):
    type: str


class PingMessage(WSMessage):
    type: str = "ping"


class PongMessage(WSMessage):
    type: str = "pong"


class ConnectedMessage(WSMessage):
    type: str = "connected"
    agent_id: str


class RequestMessage(WSMessage):
    type: str = "request"
    request_id: str
    session_id: str
    message: str
    metadata: Dict[str, Any] = {}


class ResponseMessage(WSMessage):
    type: str = "response"
    request_id: str
    content: str
    usage: Dict[str, int] = {}


class StreamChunkMessage(WSMessage):
    type: str = "stream_chunk"
    request_id: str
    content: str


class StreamEndMessage(WSMessage):
    type: str = "stream_end"
    request_id: str
    usage: Dict[str, int] = {}


class ErrorMessage(WSMessage):
    type: str = "error"
    request_id: Optional[str] = None
    detail: str


class TypingMessage(WSMessage):
    type: str = "typing"
    request_id: str
    status: str  # "typing" | "tool_running" | "idle"


class EditMessage(WSMessage):
    type: str = "edit"
    request_id: str
    text: str
    update_mode: str = "replace"  # "replace" | "append"


class ToolProgressMessage(WSMessage):
    type: str = "tool_progress"
    request_id: str
    tool: str
    emoji: str = ""
    label: str = ""
    status: str = "running"  # "running" | "done"


class SendMessage(WSMessage):
    type: str = "send"
    request_id: str
    text: str
    message_type: str = "text"  # "text" | "image" | "file" | "mixed"
    image_urls: list = []
    file_urls: list = []
