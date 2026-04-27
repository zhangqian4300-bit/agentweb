import json
import logging
import uuid
from typing import AsyncIterator, Dict, List

import httpx

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 300

CHAT_COMPLETIONS_PATH = "/v1/chat/completions"

CHARS_PER_TOKEN_ZH = 1.5
CHARS_PER_TOKEN_EN = 4.0


def _estimate_tokens_text(text: str) -> int:
    if not text:
        return 0
    zh_count = sum(1 for c in text if '一' <= c <= '鿿')
    en_count = len(text) - zh_count
    return max(1, int(zh_count / CHARS_PER_TOKEN_ZH + en_count / CHARS_PER_TOKEN_EN))


def _estimate_tokens(messages: list) -> int:
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        total += _estimate_tokens_text(content) + 4
    return total


def _build_url(endpoint_url: str) -> str:
    url = endpoint_url.rstrip("/")
    if url.endswith(CHAT_COMPLETIONS_PATH):
        return url
    return url + CHAT_COMPLETIONS_PATH


def _build_messages(message: str, metadata: dict) -> List[Dict]:
    if "messages" in metadata:
        return metadata["messages"]
    return [{"role": "user", "content": message}]


# ---------------------------------------------------------------------------
# OpenAI-compatible forwarding
# ---------------------------------------------------------------------------

async def webhook_invoke(
    endpoint_url: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    endpoint_api_key: str = None,
    timeout: float = REQUEST_TIMEOUT,
) -> dict:
    url = _build_url(endpoint_url)
    payload = {
        "model": "default",
        "messages": _build_messages(message, metadata),
        "stream": False,
    }
    headers = {"Content-Type": "application/json"}
    if endpoint_api_key:
        headers["Authorization"] = f"Bearer {endpoint_api_key}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=headers, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()

    choice = data.get("choices", [{}])[0]
    content = choice.get("message", {}).get("content", "")
    usage = data.get("usage") or {}

    input_tokens = usage.get("prompt_tokens", 0)
    output_tokens = usage.get("completion_tokens", 0)

    if not input_tokens and not output_tokens:
        input_tokens = _estimate_tokens(payload["messages"])
        output_tokens = _estimate_tokens_text(content)

    return {
        "type": "response",
        "request_id": request_id,
        "content": content,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        },
    }


async def webhook_invoke_stream(
    endpoint_url: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    endpoint_api_key: str = None,
    timeout: float = REQUEST_TIMEOUT,
) -> AsyncIterator[dict]:
    url = _build_url(endpoint_url)
    payload = {
        "model": "default",
        "messages": _build_messages(message, metadata),
        "stream": True,
    }
    headers = {"Content-Type": "application/json"}
    if endpoint_api_key:
        headers["Authorization"] = f"Bearer {endpoint_api_key}"

    total_content = ""
    final_usage = None
    payload["stream_options"] = {"include_usage": True}

    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST", url, json=payload, headers=headers, timeout=timeout
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue

                data_str = line[len("data:"):].strip()
                if data_str == "[DONE]":
                    break

                try:
                    data = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                if data.get("usage"):
                    final_usage = data["usage"]

                choices = data.get("choices", [])
                if not choices:
                    continue

                delta = choices[0].get("delta", {})
                content = delta.get("content")
                if content:
                    total_content += content
                    yield {
                        "type": "stream_chunk",
                        "request_id": request_id,
                        "content": content,
                    }

                if choices[0].get("finish_reason") == "stop":
                    break

    if not final_usage:
        input_tokens = _estimate_tokens(payload["messages"])
        output_tokens = _estimate_tokens_text(total_content)
    else:
        input_tokens = final_usage.get("prompt_tokens", 0)
        output_tokens = final_usage.get("completion_tokens", 0)

    yield {
        "type": "stream_end",
        "request_id": request_id,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        },
    }


# ---------------------------------------------------------------------------
# A2A forwarding — legacy JSON-RPC helpers (v0.1 tasks/sendSubscribe)
# ---------------------------------------------------------------------------

def _build_a2a_payload(request_id: str, message: str, metadata: dict) -> dict:
    task_id = metadata.get("task_id", f"task-{uuid.uuid4().hex[:12]}")
    a2a_metadata = {k: v for k, v in metadata.items() if k not in ("messages", "task_id")}
    msg_obj = {
        "role": "user",
        "parts": [{"kind": "text", "text": message}],
    }
    if a2a_metadata:
        msg_obj["metadata"] = a2a_metadata
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "tasks/sendSubscribe",
        "params": {
            "taskId": task_id,
            "message": msg_obj,
        },
    }


def _try_parse_sse_json(line: str):
    data_str = line[len("data:"):].strip()
    if data_str.startswith("data:"):
        data_str = data_str[len("data:"):].strip()
    try:
        return json.loads(data_str)
    except json.JSONDecodeError:
        return None


def _extract_a2a_chunk(data: dict, event_type: str = None):
    if data is None:
        return None, None

    result = data.get("result", {})

    if event_type == "artifact":
        artifact = result.get("artifact", {})
        for part in artifact.get("parts", []):
            if part.get("kind") == "text" and part.get("text"):
                return "content", part["text"]
            if part.get("text"):
                return "content", part["text"]

    if event_type == "status" or data.get("kind") == "status-update":
        status = result.get("status", data.get("status", {}))
        if status.get("state") == "completed":
            return "completed", result.get("usage")

    evt_type = data.get("type", "")
    if evt_type == "model_reply":
        delta = data.get("delta")
        if delta:
            return "content", delta
    if evt_type == "final":
        if data.get("status", {}).get("state") == "completed" or data.get("final"):
            return "completed", None

    return None, None


async def _iter_a2a_legacy_sse(resp) -> AsyncIterator[tuple]:
    event_type = None
    async for line in resp.aiter_lines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("event:"):
            event_type = line[len("event:"):].strip()
            continue
        if not line.startswith("data:"):
            continue

        data = _try_parse_sse_json(line)
        if data is None:
            continue

        kind, value = _extract_a2a_chunk(data, event_type)
        if kind:
            yield kind, value
        event_type = None


# ---------------------------------------------------------------------------
# A2A forwarding — v1.0 REST helpers (POST /message:send, /message:stream)
# ---------------------------------------------------------------------------

def _build_a2a_v1_payload(message: str, metadata: dict) -> dict:
    filtered = {k: v for k, v in metadata.items() if k != "messages"} if metadata else None
    return {
        "message": {
            "message_id": str(uuid.uuid4()),
            "role": "user",
            "parts": [{"text": message}],
            "metadata": filtered or None,
        }
    }


def _extract_a2a_v1_response(data: dict) -> str:
    if "message" in data and "task" not in data:
        parts = data["message"].get("parts", [])
    else:
        task = data.get("task", {})
        artifacts = task.get("artifacts", [])
        parts = artifacts[0].get("parts", []) if artifacts else []
    return "\n".join(p.get("text", "") for p in parts if p.get("text"))


async def _iter_a2a_v1_sse(resp) -> AsyncIterator[tuple]:
    async for line in resp.aiter_lines():
        line = line.strip()
        if not line or not line.startswith("data:"):
            continue
        data_str = line[len("data:"):].strip()
        if not data_str:
            continue
        try:
            data = json.loads(data_str)
        except json.JSONDecodeError:
            continue

        if "status_update" in data:
            status = data["status_update"].get("status", {})
            state = status.get("state", "")
            if state in ("TASK_STATE_COMPLETED", "completed"):
                yield "completed", None
        elif "artifact_update" in data:
            artifact = data["artifact_update"].get("artifact", {})
            for part in artifact.get("parts", []):
                if part.get("text"):
                    yield "content", part["text"]
        elif "task" in data:
            task = data["task"]
            status = task.get("status", {})
            if status.get("state") in ("TASK_STATE_COMPLETED", "completed"):
                artifacts = task.get("artifacts", [])
                for art in artifacts:
                    for part in art.get("parts", []):
                        if part.get("text"):
                            yield "content", part["text"]
                yield "completed", None


def _derive_a2a_v1_url(endpoint_url: str, action: str) -> str:
    base = endpoint_url.rstrip("/")
    for suffix in ["/message:send", "/message:stream", "/rpc"]:
        if base.endswith(suffix):
            base = base[:-len(suffix)]
            break
    return f"{base}/message:{action}"


# ---------------------------------------------------------------------------
# A2A forwarding — unified invoke (v1.0 first, fallback to legacy)
# ---------------------------------------------------------------------------

async def webhook_invoke_a2a(
    endpoint_url: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    endpoint_api_key: str = None,
    timeout: float = REQUEST_TIMEOUT,
) -> dict:
    headers = {"Content-Type": "application/json"}
    if endpoint_api_key:
        headers["Authorization"] = f"Bearer {endpoint_api_key}"

    v1_url = _derive_a2a_v1_url(endpoint_url, "send")
    v1_payload = _build_a2a_v1_payload(message, metadata)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(v1_url, json=v1_payload, headers=headers, timeout=timeout)
            if resp.status_code == 404:
                raise httpx.HTTPStatusError("Not Found", request=resp.request, response=resp)
            resp.raise_for_status()
            data = resp.json()

        content = _extract_a2a_v1_response(data)
        input_tokens = _estimate_tokens_text(message)
        output_tokens = _estimate_tokens_text(content)

        return {
            "type": "response",
            "request_id": request_id,
            "content": content,
            "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
        }
    except (httpx.HTTPStatusError, httpx.ConnectError):
        logger.debug("A2A v1.0 /message:send failed, falling back to legacy JSON-RPC")

    return await _webhook_invoke_a2a_legacy(
        endpoint_url, request_id, session_id, message, metadata,
        endpoint_api_key=endpoint_api_key, timeout=timeout,
    )


async def _webhook_invoke_a2a_legacy(
    endpoint_url: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    endpoint_api_key: str = None,
    timeout: float = REQUEST_TIMEOUT,
) -> dict:
    url = endpoint_url.rstrip("/")
    payload = _build_a2a_payload(request_id, message, metadata)
    headers = {"Content-Type": "application/json"}
    if endpoint_api_key:
        headers["Authorization"] = f"Bearer {endpoint_api_key}"

    total_content = ""
    final_usage = None

    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST", url, json=payload, headers=headers, timeout=timeout
        ) as resp:
            resp.raise_for_status()
            async for kind, value in _iter_a2a_legacy_sse(resp):
                if kind == "content":
                    total_content += value
                elif kind == "completed":
                    final_usage = value

    if final_usage:
        input_tokens = final_usage.get("input_tokens", 0)
        output_tokens = final_usage.get("output_tokens", 0)
    else:
        input_tokens = _estimate_tokens_text(message)
        output_tokens = _estimate_tokens_text(total_content)

    return {
        "type": "response",
        "request_id": request_id,
        "content": total_content,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        },
    }


async def webhook_invoke_stream_a2a(
    endpoint_url: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    endpoint_api_key: str = None,
    timeout: float = REQUEST_TIMEOUT,
) -> AsyncIterator[dict]:
    headers = {"Content-Type": "application/json"}
    if endpoint_api_key:
        headers["Authorization"] = f"Bearer {endpoint_api_key}"

    v1_url = _derive_a2a_v1_url(endpoint_url, "stream")
    v1_payload = _build_a2a_v1_payload(message, metadata)

    use_v1 = True
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST", v1_url, json=v1_payload, headers=headers, timeout=timeout
            ) as resp:
                if resp.status_code == 404:
                    use_v1 = False
                else:
                    resp.raise_for_status()
                    total_content = ""
                    async for kind, value in _iter_a2a_v1_sse(resp):
                        if kind == "content":
                            total_content += value
                            yield {
                                "type": "stream_chunk",
                                "request_id": request_id,
                                "content": value,
                            }
                        elif kind == "completed":
                            pass

                    input_tokens = _estimate_tokens_text(message)
                    output_tokens = _estimate_tokens_text(total_content)
                    yield {
                        "type": "stream_end",
                        "request_id": request_id,
                        "usage": {
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                        },
                    }
                    return
    except (httpx.HTTPStatusError, httpx.ConnectError):
        use_v1 = False
        logger.debug("A2A v1.0 /message:stream failed, falling back to legacy JSON-RPC")

    async for chunk in _webhook_invoke_stream_a2a_legacy(
        endpoint_url, request_id, session_id, message, metadata,
        endpoint_api_key=endpoint_api_key, timeout=timeout,
    ):
        yield chunk


async def _webhook_invoke_stream_a2a_legacy(
    endpoint_url: str,
    request_id: str,
    session_id: str,
    message: str,
    metadata: dict,
    endpoint_api_key: str = None,
    timeout: float = REQUEST_TIMEOUT,
) -> AsyncIterator[dict]:
    url = endpoint_url.rstrip("/")
    payload = _build_a2a_payload(request_id, message, metadata)
    headers = {"Content-Type": "application/json"}
    if endpoint_api_key:
        headers["Authorization"] = f"Bearer {endpoint_api_key}"

    total_content = ""
    final_usage = None

    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST", url, json=payload, headers=headers, timeout=timeout
        ) as resp:
            resp.raise_for_status()
            seen_content = set()
            async for kind, value in _iter_a2a_legacy_sse(resp):
                if kind == "content":
                    if value not in seen_content:
                        seen_content.add(value)
                        total_content += value
                        yield {
                            "type": "stream_chunk",
                            "request_id": request_id,
                            "content": value,
                        }
                elif kind == "completed":
                    final_usage = value

    if final_usage:
        input_tokens = final_usage.get("input_tokens", 0)
        output_tokens = final_usage.get("output_tokens", 0)
    else:
        input_tokens = _estimate_tokens_text(message)
        output_tokens = _estimate_tokens_text(total_content)

    yield {
        "type": "stream_end",
        "request_id": request_id,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        },
    }
