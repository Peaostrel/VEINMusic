"""Recent warnings and errors of the API and the worker, for the admin panel.

A logging handler keeps every WARNING+ record. Entries go to a capped Redis
list shared by all processes; a background thread writes them, so logging
never waits for Redis. This process's own entries are also kept in memory,
which is what the admin panel shows when Redis is unreachable.
"""
from __future__ import annotations

import json
import logging
import queue
import re
import secrets
import threading
import time
from collections import deque
from datetime import UTC, datetime
from typing import Any

from app.core.redis import REDIS_URL, get_redis_client

logger = logging.getLogger(__name__)

KEY = "admin:error_log"
MAX_ENTRIES = 1000
MAX_MESSAGE = 2000
MAX_TRACE = 6000
MAX_BACKLOG = 1000
RETRY_SEC = 5
# Loggers whose records would loop back into this handler
_IGNORED = ("redis", __name__)

# Credentials that can end up in exception texts (URLs with keys, headers)
_SECRET_PARAM_RE = re.compile(
    r"(?i)\b(api_key|apikey|access_token|refresh_token|token|ticket|password|secret|sk|sig|signature)=[^&\s'\"]+")
_AUTH_RE = re.compile(r"(?i)\b(OAuth|Bearer|Token)\s+[A-Za-z0-9._~+/=-]{8,}")

_local: deque[dict[str, Any]] = deque(maxlen=MAX_ENTRIES)


def redact(text: str) -> str:
    return _AUTH_RE.sub(r"\1 ***", _SECRET_PARAM_RE.sub(r"\1=***", text))


def _cut(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit - 1] + "…"


def make_entry(record: logging.LogRecord, source: str) -> dict[str, Any]:
    trace = None
    if record.exc_info:
        trace = _cut(redact(logging.Formatter().formatException(record.exc_info)), MAX_TRACE)
    return {
        "id": secrets.token_hex(6),
        "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
        "level": record.levelname,
        "source": source,
        "logger": record.name,
        "message": _cut(redact(record.getMessage()), MAX_MESSAGE),
        "trace": trace,
    }


class ErrorLogHandler(logging.Handler):
    def __init__(self, source: str):
        super().__init__(logging.WARNING)
        self.source = source
        self._queue: queue.SimpleQueue[dict[str, Any]] = queue.SimpleQueue()
        self._thread: threading.Thread | None = None
        self._start_lock = threading.Lock()

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith(_IGNORED):
            return
        try:
            entry = make_entry(record, self.source)
        except Exception:
            return
        _local.appendleft(entry)
        if self._queue.qsize() < MAX_BACKLOG:
            self._queue.put(entry)
            self._ensure_writer()

    def _ensure_writer(self) -> None:
        if self._thread is not None:
            return
        with self._start_lock:
            if self._thread is None:
                self._thread = threading.Thread(target=self._write_forever, name="error-log", daemon=True)
                self._thread.start()

    def _write_forever(self) -> None:  # pragma: no cover - needs a Redis server
        import redis

        client = None
        while True:
            entry = self._queue.get()
            try:
                if client is None:
                    client = redis.Redis.from_url(REDIS_URL, socket_connect_timeout=2, socket_timeout=2)
                pipe = client.pipeline()
                pipe.lpush(KEY, json.dumps(entry, ensure_ascii=False))
                pipe.ltrim(KEY, 0, MAX_ENTRIES - 1)
                pipe.execute()
            except Exception:
                client = None
                time.sleep(RETRY_SEC)  # the entry stays in this process's memory


def install(source: str) -> None:
    """Attach the handler to the root logger (once per process)."""
    root = logging.getLogger()
    if not any(isinstance(h, ErrorLogHandler) for h in root.handlers):
        root.addHandler(ErrorLogHandler(source))


async def _stored_entries() -> tuple[list[dict[str, Any]], bool]:
    """(entries newest first, whether they come from the shared Redis list)."""
    try:
        raw = await get_redis_client().lrange(KEY, 0, MAX_ENTRIES - 1)
    except Exception:
        return list(_local), False
    entries = []
    for item in raw:
        try:
            entries.append(json.loads(item))
        except (TypeError, ValueError):
            continue
    return entries, True


def _matches(entry: dict[str, Any], level: str | None, source: str | None, q: str | None) -> bool:
    if level and entry.get("level") != level:
        return False
    if source and entry.get("source") != source:
        return False
    if q:
        needle = q.lower()
        return any(needle in str(entry.get(k) or "").lower() for k in ("message", "logger", "trace"))
    return True


async def list_entries(*, level: str | None = None, source: str | None = None, q: str | None = None,
                       limit: int = 50, offset: int = 0) -> dict[str, Any]:
    entries, shared = await _stored_entries()
    matching = [e for e in entries if _matches(e, level, source, q)]
    return {
        "total": len(matching),
        "shared": shared,
        "sources": sorted({str(e.get("source")) for e in entries if e.get("source")}),
        "counts": {lvl: sum(1 for e in entries if e.get("level") == lvl)
                   for lvl in ("WARNING", "ERROR", "CRITICAL")},
        "items": matching[offset:offset + limit],
    }


async def clear() -> None:
    _local.clear()
    try:
        await get_redis_client().delete(KEY)
    except Exception as e:
        logger.info(f"Error log: Redis unavailable while clearing ({type(e).__name__})")
