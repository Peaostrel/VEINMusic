"""A ceiling on requests per client IP across the whole API.

Endpoints with their own (stricter) limits keep them; this catches floods
against everything else. The budget is generous because many people can
share one address (mobile carriers, offices). Requests from private networks
are not counted: they are the site's own server (link previews) and health
checks inside Docker. Addresses an administrator blocked (app/services/
ip_blocks.py) are refused here too, before any other code runs.
"""
from __future__ import annotations

import ipaddress
import os
import threading
import time

import anyio

REQUESTS_PER_MINUTE = 1200
_LOCAL_MAX_COUNTERS = 20_000

_local: dict[str, tuple[int, int]] = {}
_local_lock = threading.Lock()


def _exempt(ip: str | None) -> bool:
    if not ip:
        return True
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return address.is_private or address.is_loopback


_client = None
_redis_down_until = 0.0
# Give up on Redis for a while after an error, so a slow or broken Redis
# doesn't add its timeout to every request
REDIS_RETRY_SEC = 30


def _redis():
    """An async client with short timeouts, or None to count locally."""
    global _client
    from app.services.cache import redis_client
    if redis_client is None or time.monotonic() < _redis_down_until:
        return None
    if _client is None:
        import redis.asyncio as aioredis
        _client = aioredis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True,
            socket_connect_timeout=0.5, socket_timeout=0.5)
    return _client


def _local_hits(ip: str, window: int) -> int:
    with _local_lock:
        count, seen_window = _local.get(ip, (0, window))
        if seen_window != window:
            count = 0
        if len(_local) >= _LOCAL_MAX_COUNTERS and ip not in _local:
            _local.clear()
        _local[ip] = (count + 1, window)
        return count + 1


async def _hits(ip: str, window: int) -> int:
    global _redis_down_until
    client = _redis()
    if client is not None:
        try:
            pipe = client.pipeline(transaction=False)
            pipe.incr(f"flood:{ip}:{window}")
            pipe.expire(f"flood:{ip}:{window}", 120, nx=True)
            return int((await pipe.execute())[0])
        except Exception:
            _redis_down_until = time.monotonic() + REDIS_RETRY_SEC
    return _local_hits(ip, window)


async def _refuse(send, status: int, detail: str, retry_after: int) -> None:
    body = ('{"detail":"%s"}' % detail).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json; charset=utf-8"),
                    (b"retry-after", str(retry_after).encode()),
                    (b"content-length", str(len(body)).encode())],
    })
    await send({"type": "http.response.body", "body": body})


_last_noted: dict[str, float] = {}


async def _note(kind: str, ip: str) -> None:
    """Count a refusal for the admin panel: once a minute per address, so a
    flood doesn't turn into a flood of writes."""
    now = time.monotonic()
    key = f"{kind}:{ip}"
    if now - _last_noted.get(key, 0.0) < 60:
        return
    if len(_last_noted) > _LOCAL_MAX_COUNTERS:
        _last_noted.clear()
    _last_noted[key] = now
    from app.services import security_events
    await anyio.to_thread.run_sync(security_events.record, kind, ip)


async def _is_blocked(ip: str) -> bool:
    from app.services import ip_blocks
    if ip_blocks.needs_refresh():
        await anyio.to_thread.run_sync(ip_blocks.refresh)
    return ip_blocks.is_blocked(ip)


class FloodGuardMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        ip = client[0] if client else None
        if not _exempt(ip):
            if await _is_blocked(str(ip)):
                await _note("ip_blocked", str(ip))
                if scope["type"] == "websocket":
                    await send({"type": "websocket.close", "code": 1008})
                else:
                    await _refuse(send, 403, "Доступ с вашего адреса временно ограничен", 3600)
                return
            if scope["type"] == "http" and await _hits(str(ip), int(time.time()) // 60) > REQUESTS_PER_MINUTE:
                await _note("rate_limited", str(ip))
                await _refuse(send, 429, "Слишком много запросов, попробуйте через минуту", 60)
                return
        await self.app(scope, receive, send)


def reset() -> None:
    """Tests: forget the per-process counters."""
    with _local_lock:
        _local.clear()
    _last_noted.clear()
