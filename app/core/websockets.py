"""Cross-process WebSocket delivery for per-user live updates.

API and background-worker processes exchange events through Redis pub/sub.
When Redis is unavailable, events still reach sockets held by the current
process, which keeps single-process development usable.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Optional

from fastapi import WebSocket

logger = logging.getLogger(__name__)

EVENTS_CHANNEL = "ws:events"
_REDIS_RETRY_SEC = 30.0


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}
        self._redis: Any = None
        self._redis_loop: Optional[asyncio.AbstractEventLoop] = None
        self._redis_down_until = 0.0
        self._listener_task: Optional[asyncio.Task] = None

    async def _get_redis(self) -> Any:
        """Return a working Redis client for the current event loop, or None."""
        if time.monotonic() < self._redis_down_until:
            return None
        loop = asyncio.get_running_loop()
        if self._redis is None or self._redis_loop is not loop:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(
                os.getenv("REDIS_URL", "redis://localhost:6379"),
                decode_responses=True,
                socket_connect_timeout=2,
            )
            self._redis_loop = loop
            try:
                await asyncio.wait_for(self._redis.ping(), timeout=2)
            except Exception:
                logger.warning(
                    "Redis unavailable for WebSocket events; using local delivery")
                self._redis = None
                self._redis_down_until = time.monotonic() + _REDIS_RETRY_SEC
                return None
        return self._redis

    async def start(self) -> None:
        """Start relaying pub/sub events to sockets held by this API process."""
        if self._listener_task is None and await self._get_redis() is not None:
            self._listener_task = asyncio.create_task(self._listen())

    async def stop(self) -> None:
        if self._listener_task is not None:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except (asyncio.CancelledError, Exception):
                pass
            self._listener_task = None
        if self._redis is not None:
            try:
                await self._redis.aclose()
            except Exception:
                pass
            self._redis = None

    def _listener_running(self) -> bool:
        return self._listener_task is not None and not self._listener_task.done()

    async def _listen(self) -> None:
        backoff = 1.0
        while True:
            try:
                client = await self._get_redis()
                if client is None:
                    await asyncio.sleep(_REDIS_RETRY_SEC)
                    continue
                pubsub = client.pubsub()
                await pubsub.subscribe(EVENTS_CHANNEL)
                backoff = 1.0
                async for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    try:
                        await self._deliver(json.loads(message["data"]))
                    except Exception:
                        logger.exception("Failed to deliver WebSocket event")
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning(
                    "WebSocket pub/sub listener error; reconnecting",
                    exc_info=True,
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _publish(self, event: dict[str, Any]) -> None:
        client = await self._get_redis()
        if client is not None:
            try:
                await client.publish(
                    EVENTS_CHANNEL, json.dumps(event, ensure_ascii=False))
                if self._listener_running():
                    return
            except Exception:
                logger.warning(
                    "Failed to publish WebSocket event", exc_info=True)
        await self._deliver(event)

    async def _deliver(self, event: dict[str, Any]) -> None:
        username = event.get("key", "")
        sockets = list(self.active_connections.get(username, []))
        if event.get("kind") == "session_revoke":
            session_id = event.get("session_id")
            for websocket in sockets:
                if getattr(
                        getattr(websocket, "state", None),
                        "session_id",
                        None) == session_id:
                    try:
                        await websocket.close(code=1008)
                    except Exception:
                        logger.debug("Revoked socket already closed")
            return
        if event.get("kind") != "user":
            return
        payload = event.get("payload", {})
        for websocket in sockets:
            try:
                await websocket.send_json(payload)
            except Exception as exc:
                logger.debug("Failed to send WebSocket message: %s", exc)

    async def connect(self, websocket: WebSocket, username: str) -> None:
        await websocket.accept()
        self.active_connections.setdefault(username, []).append(websocket)

    def disconnect(self, websocket: WebSocket, username: str) -> None:
        connections = self.active_connections.get(username)
        if connections is None:
            return
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            del self.active_connections[username]

    async def revoke_session(self, username: str, session_id: str) -> None:
        await self._publish({
            "kind": "session_revoke",
            "key": username,
            "session_id": session_id,
        })

    async def broadcast_to_user(
            self, username: str, message: dict[str, Any]) -> None:
        await self._publish({
            "kind": "user",
            "key": username,
            "payload": message,
        })


manager = ConnectionManager()
