import abc
import json
from typing import Any, AsyncIterator, Dict, Union

import httpx


class BaseAdapter(abc.ABC):
    @abc.abstractmethod
    async def handle(
        self, message: str, session_id: str, metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Return {"content": "...", "usage": {"input_tokens": N, "output_tokens": N}}"""

    async def handle_stream(
        self, message: str, session_id: str, metadata: Dict[str, Any]
    ) -> AsyncIterator[Union[str, Dict[str, Any]]]:
        result = await self.handle(message, session_id, metadata)
        yield result

    async def close(self) -> None:
        pass


class HTTPAdapter(BaseAdapter):
    def __init__(self, endpoint: str, timeout: float = 120):
        self._endpoint = endpoint
        self._client = httpx.AsyncClient(timeout=timeout)

    async def handle(
        self, message: str, session_id: str, metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        payload = {
            "message": message,
            "session_id": session_id,
            "metadata": metadata,
        }
        resp = await self._client.post(self._endpoint, json=payload)
        resp.raise_for_status()
        data = resp.json()

        content = data.get("content", data.get("response", ""))
        usage = data.get("usage", {})
        return {"content": content, "usage": usage}

    async def handle_stream(
        self, message: str, session_id: str, metadata: Dict[str, Any]
    ) -> AsyncIterator[Union[str, Dict[str, Any]]]:
        payload = {
            "message": message,
            "session_id": session_id,
            "metadata": metadata,
            "stream": True,
        }
        async with self._client.stream("POST", self._endpoint, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                if line.startswith("data: "):
                    line = line[6:]
                yield line

    async def close(self) -> None:
        await self._client.aclose()


class OpenClawAdapter(BaseAdapter):
    """Adapter for OpenClaw gateway (OpenAI-compatible /v1/chat/completions)."""

    def __init__(
        self,
        gateway_url: str = "http://127.0.0.1:18789",
        token: str = "",
        model: str = "openclaw",
        agent_id: str = "",
    ):
        self._base_url = gateway_url.rstrip("/")
        self._model = f"openclaw/{agent_id}" if agent_id else model
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=headers,
            timeout=120,
        )

    async def handle(
        self, message: str, session_id: str, metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        payload = {
            "model": self._model,
            "messages": [{"role": "user", "content": message}],
            "stream": False,
            "user": session_id,
        }
        resp = await self._client.post("/v1/chat/completions", json=payload)
        resp.raise_for_status()
        data = resp.json()

        choice = data.get("choices", [{}])[0]
        content = choice.get("message", {}).get("content", "")
        raw_usage = data.get("usage", {})
        usage = {
            "input_tokens": raw_usage.get("prompt_tokens", 0),
            "output_tokens": raw_usage.get("completion_tokens", 0),
        }
        return {"content": content, "usage": usage}

    async def handle_stream(
        self, message: str, session_id: str, metadata: Dict[str, Any]
    ) -> AsyncIterator[Union[str, Dict[str, Any]]]:
        payload = {
            "model": self._model,
            "messages": [{"role": "user", "content": message}],
            "stream": True,
            "stream_options": {"include_usage": True},
            "user": session_id,
        }
        async with self._client.stream("POST", "/v1/chat/completions", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                if "usage" in chunk and chunk["usage"]:
                    raw = chunk["usage"]
                    yield {
                        "usage": {
                            "input_tokens": raw.get("prompt_tokens", 0),
                            "output_tokens": raw.get("completion_tokens", 0),
                        }
                    }

                delta = chunk.get("choices", [{}])[0].get("delta", {})
                text = delta.get("content")
                if text:
                    yield text

    async def close(self) -> None:
        await self._client.aclose()
