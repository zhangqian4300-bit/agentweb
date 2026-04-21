import asyncio
import json
import logging
from typing import Any, Callable, Coroutine, Dict, List, Optional

import websockets
from websockets.asyncio.client import ClientConnection

from .exceptions import AgentWebConnectionError, AuthenticationError

logger = logging.getLogger("agentweb_sdk")

MAX_RECONNECT_DELAY = 60


class Connection:
    def __init__(self, ws_url: str, agent_key: str):
        self._ws_url = ws_url
        self._agent_key = agent_key
        self._ws: Optional[ClientConnection] = None
        self._connected_agent_ids: List[str] = []
        self._on_request: Optional[Callable] = None
        self._running = False
        self._reconnect_delay = 1.0

    @property
    def agent_ids(self) -> List[str]:
        return self._connected_agent_ids

    def on_request(self, callback: Callable[..., Coroutine]) -> None:
        self._on_request = callback

    async def connect(self) -> None:
        url = f"{self._ws_url}?agent_key={self._agent_key}"
        try:
            self._ws = await websockets.connect(url)
        except Exception as e:
            raise AgentWebConnectionError(f"Failed to connect: {e}") from e

        raw = await self._ws.recv()
        msg = json.loads(raw)

        if msg.get("type") == "error":
            await self._ws.close()
            raise AuthenticationError(msg.get("detail", "Authentication failed"))

        if msg.get("type") == "connected":
            self._connected_agent_ids = msg.get("agent_ids", [])
            self._reconnect_delay = 1.0
            logger.info(f"Connected, agents: {self._connected_agent_ids}")

    async def run_forever(self) -> None:
        self._running = True
        while self._running:
            try:
                await self.connect()
                await self._receive_loop()
            except (AuthenticationError, KeyboardInterrupt):
                raise
            except Exception as e:
                if not self._running:
                    break
                logger.warning(f"Connection lost: {e}, reconnecting in {self._reconnect_delay:.0f}s...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, MAX_RECONNECT_DELAY)

    async def _receive_loop(self) -> None:
        async for raw in self._ws:
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "ping":
                await self._ws.send(json.dumps({"type": "pong"}))
            elif msg_type == "request":
                if self._on_request:
                    asyncio.create_task(self._handle_request(data))
            else:
                logger.debug(f"Unhandled message type: {msg_type}")

    async def _handle_request(self, data: Dict[str, Any]) -> None:
        request_id = data["request_id"]
        try:
            await self._on_request(
                request_id=request_id,
                session_id=data.get("session_id", ""),
                message=data.get("message", ""),
                metadata=data.get("metadata", {}),
                stream=data.get("stream", False),
                send=self._send,
            )
        except Exception as e:
            logger.error(f"Handler error for {request_id}: {e}")
            await self._send({
                "type": "error",
                "request_id": request_id,
                "detail": str(e),
            })

    async def _send(self, data: dict) -> None:
        if self._ws:
            await self._ws.send(json.dumps(data))

    async def disconnect(self) -> None:
        self._running = False
        if self._ws:
            await self._ws.close()
            self._ws = None
