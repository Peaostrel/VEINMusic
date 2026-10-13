"""A ceiling on requests per client IP across the whole API.

Endpoints with their own (stricter) limits keep them; this catches floods
against everything else. The budget is generous because many people can
share one address (mobile carriers, offices). Requests from private networks
are not counted: they are the site's own server (link previews) and health
checks inside Docker.
"""
from __future__ import annotations

import ipaddress
import threading
import time

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


def _redis():
    from app.services.cache import redis_client
    return redis_client


def _hits(ip: str, window: int) -> int:
    key = f"flood:{ip}:{window}"
    client = _redis()
    if client is not None:
        try:
            pipe = client.pipeline()
            pipe.incr(key)
            pipe.expire(key, 120, nx=True)
            return int(pipe.execute()[0])
        except Exception:
            pass
    with _local_lock:
        count, seen_window = _local.get(ip, (0, window))
        if seen_window != window:
            count = 0
        if len(_local) >= _LOCAL_MAX_COUNTERS and ip not in _local:
            _local.clear()
        _local[ip] = (count + 1, window)
        return count + 1


async def _too_many(send) -> None:
    body = '{"detail":"Слишком много запросов, попробуйте через минуту"}'.encode()
    await send({
        "type": "http.response.start",
        "status": 429,
        "headers": [(b"content-type", b"application/json; charset=utf-8"),
                    (b"retry-after", b"60"),
                    (b"content-length", str(len(body)).encode())],
    })
    await send({"type": "http.response.body", "body": body})


class FloodGuardMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            client = scope.get("client")
            ip = client[0] if client else None
            if not _exempt(ip) and _hits(str(ip), int(time.time()) // 60) > REQUESTS_PER_MINUTE:
                await _too_many(send)
                return
        await self.app(scope, receive, send)


def reset() -> None:
    """Tests: forget the per-process counters."""
    with _local_lock:
        _local.clear()
