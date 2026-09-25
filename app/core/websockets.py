"""WebSocket connections and 'Listen Together' rooms.

State that must be shared between processes (API workers and the arq worker)
lives in Redis:

* room state (name, host, current track, listeners, chat) is stored in Redis
  hashes/lists with a TTL;
* every broadcast is published on a Redis pub/sub channel and each API process
  delivers it to the WebSockets it holds locally.

Without Redis everything falls back to process-local memory, which is fine
for a single-process development setup.
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

MAX_TOGETHER_ROOMS = 200
MAX_ROOM_LISTENERS = 100
ROOM_TTL_SEC = 3600
CHAT_HISTORY_LIMIT = 100
EVENTS_CHANNEL = "ws:events"
_REDIS_RETRY_SEC = 30.0


def _default_track(host_username: str) -> dict[str, Any]:
    return {
        "title": "Ожидание трека от DJ...",
        "artist": host_username,
        "album": "",
        "cover_url": "",
        "duration": 180,
        "progress_sec": 0,
        "is_playing": False,
        "updated_at": time.time(),
    }


class _MemoryRoomStore:
    """Process-local room state (used when Redis is unavailable)."""

    def __init__(self) -> None:
        self.rooms: dict[str, dict[str, Any]] = {}

    async def create_if_absent(self, room_id: str, name: str, host: str) -> bool:
        if room_id in self.rooms:
            return True
        if len(self.rooms) >= MAX_TOGETHER_ROOMS:
            return False
        self.rooms[room_id] = {"name": name, "host": host, "track": _default_track(host),
                               "listeners": {}, "chat": []}
        return True

    async def get(self, room_id: str) -> Optional[dict[str, Any]]:
        room = self.rooms.get(room_id)
        if room is None:
            return None
        return {"name": room["name"], "host": room["host"], "track": dict(room["track"])}

    async def listener_count(self, room_id: str) -> int:
        room = self.rooms.get(room_id)
        return len(room["listeners"]) if room else 0

    async def add_listener(self, room_id: str, username: str) -> None:
        listeners = self.rooms[room_id]["listeners"]
        listeners[username] = listeners.get(username, 0) + 1

    async def remove_listener(self, room_id: str, username: str) -> None:
        room = self.rooms.get(room_id)
        if not room:
            return
        count = room["listeners"].get(username, 0) - 1
        if count > 0:
            room["listeners"][username] = count
        else:
            room["listeners"].pop(username, None)

    async def listeners(self, room_id: str) -> list[str]:
        room = self.rooms.get(room_id)
        return list(room["listeners"].keys()) if room else []

    async def update_track(self, room_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        track = self.rooms[room_id]["track"]
        track.update(fields)
        return dict(track)

    async def add_chat(self, room_id: str, message: dict[str, Any]) -> None:
        chat = self.rooms[room_id]["chat"]
        chat.append(message)
        del chat[:-CHAT_HISTORY_LIMIT]

    async def chat(self, room_id: str, limit: int) -> list[dict[str, Any]]:
        room = self.rooms.get(room_id)
        return list(room["chat"][-limit:]) if room else []

    async def delete(self, room_id: str) -> None:
        self.rooms.pop(room_id, None)

    async def room_ids(self) -> list[str]:
        return list(self.rooms.keys())


class _RedisRoomStore:
    """Room state shared between processes through Redis."""

    INDEX = "together:rooms"

    def __init__(self, client: Any) -> None:
        self.r = client

    @staticmethod
    def _k(room_id: str, suffix: str = "") -> str:
        return f"together:room:{room_id}{suffix}"

    async def _touch(self, room_id: str) -> None:
        pipe = self.r.pipeline()
        for suffix in ("", ":listeners", ":chat"):
            pipe.expire(self._k(room_id, suffix), ROOM_TTL_SEC)
        await pipe.execute()

    async def create_if_absent(self, room_id: str, name: str, host: str) -> bool:
        if await self.r.exists(self._k(room_id)):
            await self._touch(room_id)
            return True
        # Drop index entries of rooms whose keys already expired
        for rid in await self.r.smembers(self.INDEX):
            if not await self.r.exists(self._k(rid)):
                await self.r.srem(self.INDEX, rid)
        if await self.r.scard(self.INDEX) >= MAX_TOGETHER_ROOMS:
            return False
        created = await self.r.hsetnx(self._k(room_id), "host", host)
        if created:
            await self.r.hset(self._k(room_id), mapping={
                "name": name, "track": json.dumps(_default_track(host))})
            await self.r.sadd(self.INDEX, room_id)
        await self._touch(room_id)
        return True

    async def get(self, room_id: str) -> Optional[dict[str, Any]]:
        data = await self.r.hgetall(self._k(room_id))
        if not data or "host" not in data:
            return None
        track = json.loads(data.get("track") or "{}") or _default_track(data["host"])
        return {"name": data.get("name", ""), "host": data["host"], "track": track}

    async def listener_count(self, room_id: str) -> int:
        return int(await self.r.hlen(self._k(room_id, ":listeners")))

    async def add_listener(self, room_id: str, username: str) -> None:
        await self.r.hincrby(self._k(room_id, ":listeners"), username, 1)
        await self._touch(room_id)

    async def remove_listener(self, room_id: str, username: str) -> None:
        key = self._k(room_id, ":listeners")
        if await self.r.hincrby(key, username, -1) <= 0:
            await self.r.hdel(key, username)

    async def listeners(self, room_id: str) -> list[str]:
        return list(await self.r.hkeys(self._k(room_id, ":listeners")))

    async def update_track(self, room_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        room = await self.get(room_id)
        track = room["track"] if room else _default_track("DJ")
        track.update(fields)
        await self.r.hset(self._k(room_id), "track", json.dumps(track))
        await self._touch(room_id)
        return track

    async def add_chat(self, room_id: str, message: dict[str, Any]) -> None:
        key = self._k(room_id, ":chat")
        pipe = self.r.pipeline()
        pipe.rpush(key, json.dumps(message, ensure_ascii=False))
        pipe.ltrim(key, -CHAT_HISTORY_LIMIT, -1)
        await pipe.execute()
        await self._touch(room_id)

    async def chat(self, room_id: str, limit: int) -> list[dict[str, Any]]:
        return [json.loads(m) for m in await self.r.lrange(self._k(room_id, ":chat"), -limit, -1)]

    async def delete(self, room_id: str) -> None:
        await self.r.delete(self._k(room_id), self._k(room_id, ":listeners"), self._k(room_id, ":chat"))
        await self.r.srem(self.INDEX, room_id)

    async def room_ids(self) -> list[str]:
        ids = []
        for rid in await self.r.smembers(self.INDEX):
            if await self.r.exists(self._k(rid)):
                ids.append(rid)
            else:
                await self.r.srem(self.INDEX, rid)
        return ids


class ConnectionManager:
    def __init__(self) -> None:
        # WebSockets held by *this* process
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.room_sockets: dict[str, dict[str, WebSocket]] = {}

        self._memory_store = _MemoryRoomStore()
        self._redis: Any = None
        self._redis_loop: Optional[asyncio.AbstractEventLoop] = None
        self._redis_down_until = 0.0
        self._listener_task: Optional[asyncio.Task] = None

    # --- Redis plumbing -------------------------------------------------

    async def _get_redis(self) -> Any:
        """Return a working Redis client for the current event loop, or None."""
        if time.monotonic() < self._redis_down_until:
            return None
        loop = asyncio.get_running_loop()
        if self._redis is None or self._redis_loop is not loop:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(
                os.getenv("REDIS_URL", "redis://localhost:6379"),
                decode_responses=True, socket_connect_timeout=2)
            self._redis_loop = loop
            try:
                await asyncio.wait_for(self._redis.ping(), timeout=2)
            except Exception:
                logger.warning("Redis unavailable for WebSocket state; using in-memory fallback")
                self._redis = None
                self._redis_down_until = time.monotonic() + _REDIS_RETRY_SEC
                return None
        return self._redis

    async def _store(self) -> Any:
        client = await self._get_redis()
        return _RedisRoomStore(client) if client is not None else self._memory_store

    async def start(self) -> None:
        """Start relaying pub/sub events to local sockets (API processes)."""
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
                logger.warning("WebSocket pub/sub listener error; reconnecting", exc_info=True)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _publish(self, event: dict[str, Any]) -> None:
        client = await self._get_redis()
        if client is not None:
            try:
                await client.publish(EVENTS_CHANNEL, json.dumps(event, ensure_ascii=False))
                if self._listener_running():
                    return  # our own listener delivers it to local sockets
            except Exception:
                logger.warning("Failed to publish WebSocket event", exc_info=True)
        await self._deliver(event)

    async def _deliver(self, event: dict[str, Any]) -> None:
        payload = event.get("payload", {})
        if event.get("kind") == "user":
            sockets = list(self.active_connections.get(event.get("key", ""), []))
        else:
            exclude = event.get("exclude")
            sockets = [ws for user, ws in self.room_sockets.get(event.get("key", ""), {}).items()
                       if user != exclude]
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception as e:
                logger.debug(f"Failed to send WS message: {e}")

    # --- Per-user sockets ----------------------------------------------

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections.setdefault(username, []).append(websocket)

    def disconnect(self, websocket: WebSocket, username: str):
        conns = self.active_connections.get(username)
        if conns is not None:
            if websocket in conns:
                conns.remove(websocket)
            if not conns:
                del self.active_connections[username]

    async def broadcast_to_user(self, username: str, message: dict):
        await self._publish({"kind": "user", "key": username, "payload": message})

    # --- Listen Together rooms -----------------------------------------

    async def join_room(self, room_id: str, username: str, websocket: WebSocket) -> Optional[dict[str, Any]]:
        """Create the room if needed (first joiner becomes host) and register
        the listener. Returns the room state, or None if limits are reached."""
        store = await self._store()
        if not await store.create_if_absent(room_id, f"Комната {room_id}", username):
            return None
        if await store.listener_count(room_id) >= MAX_ROOM_LISTENERS:
            return None
        await store.add_listener(room_id, username)
        self.room_sockets.setdefault(room_id, {})[username] = websocket
        return await self.room_state(room_id)

    async def leave_room(self, room_id: str, username: str, websocket: WebSocket) -> list[str]:
        """Unregister a listener; deletes the room when it becomes empty.
        Returns the remaining listeners."""
        local = self.room_sockets.get(room_id, {})
        # The same user may have reconnected (e.g. a second tab) meanwhile
        if local.get(username) is websocket:
            local.pop(username, None)
        if not local:
            self.room_sockets.pop(room_id, None)
        store = await self._store()
        await store.remove_listener(room_id, username)
        remaining = await store.listeners(room_id)
        if not remaining:
            await store.delete(room_id)
        return remaining

    async def room_state(self, room_id: str) -> Optional[dict[str, Any]]:
        store = await self._store()
        room = await store.get(room_id)
        if room is None:
            return None
        return {
            "room_id": room_id,
            "name": room["name"],
            "host": room["host"],
            "current_track": room["track"],
            "listeners": await store.listeners(room_id),
            "chat_history": await store.chat(room_id, 30),
        }

    async def update_room_track(self, room_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        store = await self._store()
        return await store.update_track(room_id, fields)

    async def add_room_chat(self, room_id: str, message: dict[str, Any]) -> None:
        store = await self._store()
        await store.add_chat(room_id, message)

    async def broadcast_to_room(self, room_id: str, message: dict[str, Any],
                                exclude_user: Optional[str] = None) -> None:
        await self._publish({"kind": "room", "key": room_id, "exclude": exclude_user, "payload": message})

    async def get_active_rooms_info(self) -> list[dict[str, Any]]:
        store = await self._store()
        rooms = []
        for room_id in await store.room_ids():
            room = await store.get(room_id)
            if room is None:
                continue
            listeners = await store.listeners(room_id)
            rooms.append({
                "room_id": room_id,
                "name": room["name"],
                "host_username": room["host"],
                "listeners_count": len(listeners),
                "listeners": listeners,
                "current_track": room["track"],
            })
        return rooms


manager = ConnectionManager()
