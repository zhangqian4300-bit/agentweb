import asyncio
import inspect
import json
import logging
from typing import Any, Callable, Dict, List, Optional

import httpx

from .adapter import BaseAdapter
from .connection import Connection
from .exceptions import RegistrationError

logger = logging.getLogger("agentweb_sdk")


class UsageTracker:
    def __init__(self):
        self.total_input_tokens: int = 0
        self.total_output_tokens: int = 0
        self.total_requests: int = 0

    def record(self, usage: Dict[str, int]) -> None:
        self.total_input_tokens += usage.get("input_tokens", 0)
        self.total_output_tokens += usage.get("output_tokens", 0)
        self.total_requests += 1

    @property
    def summary(self) -> Dict[str, int]:
        return {
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_requests": self.total_requests,
        }


class AgentWebPlugin:
    def __init__(self, platform_url: str, agent_key: str):
        self._platform_url = platform_url.rstrip("/")
        self._agent_key = agent_key
        self._handler: Optional[Callable] = None
        self._stream_handler: Optional[Callable] = None
        self._adapter: Optional[BaseAdapter] = None
        self._connection: Optional[Connection] = None
        self._agent_ids: List[str] = []
        self.usage = UsageTracker()

    def _api_url(self, path: str) -> str:
        return f"{self._platform_url}/api/v1{path}"

    def _ws_url(self) -> str:
        url = self._platform_url
        if url.startswith("https://"):
            url = "wss://" + url[8:]
        elif url.startswith("http://"):
            url = "ws://" + url[7:]
        return f"{url}/ws/agent"

    async def register(
        self,
        name: str,
        description: str = "",
        version: str = "1.0.0",
        capabilities: Optional[List[Dict[str, Any]]] = None,
        pricing_per_million_tokens: float = 10.0,
        category: Optional[str] = None,
    ) -> dict:
        payload = {
            "name": name,
            "description": description,
            "version": version,
            "capabilities": capabilities or [],
            "pricing_per_million_tokens": pricing_per_million_tokens,
        }
        if category:
            payload["category"] = category

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self._api_url("/agents/register"),
                json=payload,
                headers={"Authorization": f"Bearer {self._agent_key}"},
            )
            if resp.status_code >= 400:
                raise RegistrationError(f"Registration failed ({resp.status_code}): {resp.text}")
            data = resp.json()
            logger.info(f"Agent registered: {data.get('id')} - {data.get('name')}")
            return data

    def handler(self, func: Callable) -> Callable:
        self._handler = func
        return func

    def stream_handler(self, func: Callable) -> Callable:
        self._stream_handler = func
        return func

    def use_adapter(self, adapter: BaseAdapter) -> None:
        self._adapter = adapter

    async def _dispatch_request(
        self,
        request_id: str,
        session_id: str,
        message: str,
        metadata: Dict[str, Any],
        stream: bool,
        send: Callable,
    ) -> None:
        if stream and (self._stream_handler or self._adapter):
            await self._dispatch_stream(request_id, session_id, message, metadata, send)
        else:
            await self._dispatch_single(request_id, session_id, message, metadata, send)

    async def _dispatch_single(
        self,
        request_id: str,
        session_id: str,
        message: str,
        metadata: Dict[str, Any],
        send: Callable,
    ) -> None:
        if self._adapter:
            result = await self._adapter.handle(message, session_id, metadata)
        elif self._handler:
            result = await self._call_handler(
                self._handler, message, session_id, metadata
            )
        else:
            result = {"content": "", "usage": {}}

        if isinstance(result, str):
            result = {"content": result, "usage": {}}

        usage = result.get("usage", {})
        self.usage.record(usage)

        await send({
            "type": "response",
            "request_id": request_id,
            "content": result.get("content", ""),
            "usage": usage,
        })

    async def _dispatch_stream(
        self,
        request_id: str,
        session_id: str,
        message: str,
        metadata: Dict[str, Any],
        send: Callable,
    ) -> None:
        usage = {}

        if self._adapter:
            gen = self._adapter.handle_stream(message, session_id, metadata)
        elif self._stream_handler:
            gen = self._call_handler_gen(self._stream_handler, message, session_id, metadata)
        else:
            gen = None

        if gen:
            async for chunk in gen:
                if isinstance(chunk, dict):
                    usage = chunk.get("usage", usage)
                    content = chunk.get("content", "")
                    if content:
                        await send({
                            "type": "stream_chunk",
                            "request_id": request_id,
                            "content": content,
                        })
                else:
                    await send({
                        "type": "stream_chunk",
                        "request_id": request_id,
                        "content": str(chunk),
                    })

        self.usage.record(usage)

        await send({
            "type": "stream_end",
            "request_id": request_id,
            "usage": usage,
        })

    async def _call_handler(
        self, func: Callable, message: str, session_id: str, metadata: dict
    ) -> Any:
        kwargs = self._build_kwargs(func, message, session_id, metadata)
        if inspect.iscoroutinefunction(func):
            return await func(**kwargs)
        return func(**kwargs)

    def _call_handler_gen(
        self, func: Callable, message: str, session_id: str, metadata: dict
    ):
        kwargs = self._build_kwargs(func, message, session_id, metadata)
        return func(**kwargs)

    @staticmethod
    def _build_kwargs(func: Callable, message: str, session_id: str, metadata: dict) -> Dict[str, Any]:
        kwargs: Dict[str, Any] = {}
        sig = inspect.signature(func)
        params = sig.parameters
        has_var_keyword = any(
            p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values()
        )
        if "message" in params or has_var_keyword:
            kwargs["message"] = message
        if "session_id" in params or has_var_keyword:
            kwargs["session_id"] = session_id
        if "metadata" in params or has_var_keyword:
            kwargs["metadata"] = metadata
        return kwargs

    async def start(self) -> None:
        self._connection = Connection(self._ws_url(), self._agent_key)
        self._connection.on_request(self._dispatch_request)
        await self._connection.run_forever()

    async def stop(self) -> None:
        if self._connection:
            await self._connection.disconnect()
        if self._adapter:
            await self._adapter.close()

    def run(self) -> None:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        )
        logger.info(f"Starting AgentWeb plugin, connecting to {self._platform_url}")
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(self.start())
        except KeyboardInterrupt:
            logger.info("Shutting down...")
            loop.run_until_complete(self.stop())
        finally:
            loop.close()
            logger.info(f"Plugin stopped. Usage: {self.usage.summary}")
