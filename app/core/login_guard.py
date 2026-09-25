"""Temporary account lockout after repeated failed logins.

Complements the per-IP rate limit: a distributed attacker can't keep guessing
one account's password. Counters live in Redis (shared by all processes),
with a per-process memory fallback.
"""
from __future__ import annotations

import threading
import time

MAX_FAILED_ATTEMPTS = 10
LOCKOUT_WINDOW_SEC = 15 * 60

_local: dict[str, tuple[int, float]] = {}
_local_lock = threading.Lock()


def _key(username: str) -> str:
    return f"login_fail:{username}"


def _redis():
    from app.services.cache import redis_client
    return redis_client


def seconds_until_unlocked(username: str) -> int:
    """0 if the account may try to log in, otherwise the remaining lock time."""
    client = _redis()
    if client is not None:
        try:
            count = int(client.get(_key(username)) or 0)
            if count >= MAX_FAILED_ATTEMPTS:
                return max(int(client.ttl(_key(username))), 1)
            return 0
        except Exception:
            pass
    with _local_lock:
        count, expires = _local.get(username, (0, 0.0))
        if expires <= time.time():
            _local.pop(username, None)
            return 0
        return int(expires - time.time()) + 1 if count >= MAX_FAILED_ATTEMPTS else 0


def register_failure(username: str) -> None:
    client = _redis()
    if client is not None:
        try:
            pipe = client.pipeline()
            pipe.incr(_key(username))
            pipe.expire(_key(username), LOCKOUT_WINDOW_SEC, nx=True)
            pipe.execute()
            return
        except Exception:
            pass
    with _local_lock:
        count, expires = _local.get(username, (0, 0.0))
        if expires <= time.time():
            count, expires = 0, time.time() + LOCKOUT_WINDOW_SEC
        _local[username] = (count + 1, expires)


def reset(username: str) -> None:
    client = _redis()
    if client is not None:
        try:
            client.delete(_key(username))
        except Exception:
            pass
    with _local_lock:
        _local.pop(username, None)
