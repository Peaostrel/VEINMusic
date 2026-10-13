"""Hard cap on request body size, enforced before anything parses the body.

FastAPI reads and parses a JSON body before it resolves authentication or
rate limits, and parsed JSON takes many times its size in memory (9 MB of
nested empty arrays become ~190 MB of Python objects). Without a cap a single
anonymous request could make the API run out of memory. Caddy still allows
20 MB per request; this middleware is the real limit.
"""
from __future__ import annotations

import asyncio

from fastapi import HTTPException

# Everything the API accepts is small JSON, except these
DEFAULT_LIMIT = 256 * 1024
PATH_LIMITS: tuple[tuple[str, int], ...] = (
    ("/api/upload", 6 * 1024 * 1024),  # avatar/cover images, 5 MB + multipart overhead
    ("/api/account/history/", 2 * 1024 * 1024),  # history transfer, 5000 plays
)
# Bodies above the default limit are processed at most this many at a time per
# process, so even allowed sizes can't add up to an out-of-memory crash
MAX_CONCURRENT_LARGE = 2

_large_slots = asyncio.Semaphore(MAX_CONCURRENT_LARGE)


class RequestTooLarge(HTTPException):
    def __init__(self) -> None:
        super().__init__(413, "Слишком большой запрос")


def limit_for(path: str) -> int:
    for prefix, limit in PATH_LIMITS:
        if path.startswith(prefix):
            return limit
    return DEFAULT_LIMIT


def _declared_length(scope) -> int | None:
    for name, value in scope.get("headers", []):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


async def _send_error(send, status: int, detail: str) -> None:
    body = ('{"detail":"%s"}' % detail).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json; charset=utf-8"),
                    (b"content-length", str(len(body)).encode())],
    })
    await send({"type": "http.response.body", "body": body})


class BodySizeLimitMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") in ("GET", "HEAD", "OPTIONS"):
            await self.app(scope, receive, send)
            return
        limit = limit_for(scope.get("path", ""))
        declared = _declared_length(scope)
        if declared is not None and declared > limit:
            await _send_error(send, 413, "Слишком большой запрос")
            return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # Raised inside FastAPI's body reading, which passes
                    # HTTPExceptions through, so the client gets a 413
                    raise RequestTooLarge()
            return message

        large = limit > DEFAULT_LIMIT and (declared is None or declared > DEFAULT_LIMIT)
        if not large:
            await self.app(scope, limited_receive, send)
            return
        if _large_slots.locked():
            await _send_error(send, 503, "Сервер занят, повторите через минуту")
            return
        async with _large_slots:
            await self.app(scope, limited_receive, send)
