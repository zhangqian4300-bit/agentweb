import json
import logging
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
    zh_count = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
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
