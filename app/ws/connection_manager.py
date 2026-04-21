import asyncio
import logging
from typing import AsyncIterator, Dict, Optional

from fastapi import WebSocket

logger = logging.getLogger(__name__)

RECONNECT_WAIT_TIMEOUT = 30


class ConnectionManager:
    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._pending_streams: Dict[str, asyncio.Queue] = {}
        self._reconnect_events: Dict[str, asyncio.Event] = {}

    async def connect(self, agent_id: str, websocket: WebSocket) -> None:
        old = self._connections.get(agent_id)
        if old:
            try:
                await old.close(code=4009, reason="Replaced by new connection")
            except Exception:
                pass
        self._connections[agent_id] = websocket
        event = self._reconnect_events.get(agent_id)
        if event:
            event.set()
        logger.info(f"Agent {agent_id} connected")

    async def disconnect(self, agent_id: str) -> None:
        self._connections.pop(agent_id, None)
        self._reconnect_events[agent_id] = asyncio.Event()
        logger.info(f"Agent {agent_id} disconnected, buffering requests for {RECONNECT_WAIT_TIMEOUT}s")

    def is_online(self, agent_id: str) -> bool:
        return agent_id in self._connections

    async def wait_online(self, agent_id: str, timeout: float = RECONNECT_WAIT_TIMEOUT) -> bool:
        if self.is_online(agent_id):
            return True
        event = self._reconnect_events.get(agent_id)
        if not event:
            return False
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            return self.is_online(agent_id)
        except asyncio.TimeoutError:
            return False

    def get_websocket(self, agent_id: str) -> Optional[WebSocket]:
        return self._connections.get(agent_id)

    async def send_request(self, agent_id: str, message: dict, timeout: float = 300) -> dict:
        ws = self._connections.get(agent_id)
        if not ws:
            if not await self.wait_online(agent_id):
                raise ConnectionError(f"Agent {agent_id} not connected")
            ws = self._connections.get(agent_id)

        request_id = message["request_id"]
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending_requests[request_id] = future

        try:
            await ws.send_json(message)
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            raise TimeoutError(f"Agent {agent_id} did not respond within {timeout}s")
        finally:
            self._pending_requests.pop(request_id, None)

    async def send_request_stream(
        self, agent_id: str, message: dict, timeout: float = 300
    ) -> AsyncIterator[dict]:
        ws = self._connections.get(agent_id)
        if not ws:
            if not await self.wait_online(agent_id):
                raise ConnectionError(f"Agent {agent_id} not connected")
            ws = self._connections.get(agent_id)

        request_id = message["request_id"]
        queue: asyncio.Queue = asyncio.Queue()
        self._pending_streams[request_id] = queue

        try:
            await ws.send_json(message)
            while True:
                try:
                    chunk = await asyncio.wait_for(queue.get(), timeout=timeout)
                except asyncio.TimeoutError:
                    raise TimeoutError(f"Agent {agent_id} stream timeout")

                yield chunk
                if chunk.get("type") == "stream_end":
                    break
        finally:
            self._pending_streams.pop(request_id, None)

    def resolve_response(self, request_id: str, data: dict) -> bool:
        future = self._pending_requests.get(request_id)
        if future and not future.done():
            future.set_result(data)
            return True
        return False

    def push_stream_chunk(self, request_id: str, data: dict) -> bool:
        queue = self._pending_streams.get(request_id)
        if queue:
            queue.put_nowait(data)
            return True
        return False

    @property
    def active_count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()
