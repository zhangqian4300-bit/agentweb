import json
import logging
from typing import AsyncIterator, Dict, List

import httpx

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 300

CHAT_COMPLETIONS_PATH = "/v1/chat/completions"


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
    usage = data.get("usage", {})

    return {
        "type": "response",
        "request_id": request_id,
        "content": content,
        "usage": {
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
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

    usage = data.get("usage") if "data" in dir() else None
    yield {
        "type": "stream_end",
        "request_id": request_id,
        "usage": {
            "input_tokens": usage.get("prompt_tokens", 0) if usage else 0,
            "output_tokens": usage.get("completion_tokens", 0) if usage else 0,
        },
    }
