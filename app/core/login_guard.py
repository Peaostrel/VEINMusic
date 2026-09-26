"""Temporary lockout after repeated failed logins.

Complements the per-IP rate limit. Two counters are kept per account:

* per account *and* client IP: after MAX_FAILED_ATTEMPTS failures that IP
  can't log in to the account for a while. Someone guessing from their own
  address therefore can't lock the real owner out;
* per account from all IPs: after MAX_FAILED_ATTEMPTS_TOTAL failures the
  account is locked everywhere, which stops a distributed guessing attack.

Counters live in Redis (shared by all processes), with a per-process memory
fallback.
"""
from __future__ import annotations

import threading
import time

MAX_FAILED_ATTEMPTS = 10
MAX_FAILED_ATTEMPTS_TOTAL = 100
LOCKOUT_WINDOW_SEC = 15 * 60
# Bound of the in-memory fallback, so random usernames can't grow it forever
_LOCAL_MAX_ENTRIES = 10_000

_local: dict[str, tuple[int, float]] = {}
_local_lock = threading.Lock()


def _keys(username: str, ip: str | None) -> list[tuple[str, int]]:
    return [
        (f"login_fail:{username}:{ip or '-'}", MAX_FAILED_ATTEMPTS),
        (f"login_fail_total:{username}", MAX_FAILED_ATTEMPTS_TOTAL),
    ]


def _redis():
    from app.services.cache import redis_client
    return redis_client


def _remaining_redis(client, key: str, limit: int) -> int:
    count = int(client.get(key) or 0)
    if count >= limit:
        return max(int(client.ttl(key)), 1)
    return 0


def _remaining_local(key: str, limit: int) -> int:
    count, expires = _local.get(key, (0, 0.0))
    if expires <= time.time():
        _local.pop(key, None)
        return 0
    return int(expires - time.time()) + 1 if count >= limit else 0


def seconds_until_unlocked(username: str, ip: str | None = None) -> int:
    """0 if this client may try to log in, otherwise the remaining lock time."""
    client = _redis()
    if client is not None:
        try:
            return max(_remaining_redis(client, key, limit) for key, limit in _keys(username, ip))
        except Exception:
            pass
    with _local_lock:
        return max(_remaining_local(key, limit) for key, limit in _keys(username, ip))


def register_failure(username: str, ip: str | None = None) -> None:
    client = _redis()
    if client is not None:
        try:
            pipe = client.pipeline()
            for key, _ in _keys(username, ip):
                pipe.incr(key)
                pipe.expire(key, LOCKOUT_WINDOW_SEC, nx=True)
            pipe.execute()
            return
        except Exception:
            pass
    with _local_lock:
        now = time.time()
        if len(_local) >= _LOCAL_MAX_ENTRIES:
            for stale in [k for k, (_, exp) in _local.items() if exp <= now]:
                del _local[stale]
            if len(_local) >= _LOCAL_MAX_ENTRIES:
                return  # under attack: rely on the per-IP rate limit
        for key, _ in _keys(username, ip):
            count, expires = _local.get(key, (0, 0.0))
            if expires <= now:
                count, expires = 0, now + LOCKOUT_WINDOW_SEC
            _local[key] = (count + 1, expires)


def reset(username: str, ip: str | None = None) -> None:
    keys = [key for key, _ in _keys(username, ip)]
    client = _redis()
    if client is not None:
        try:
            client.delete(*keys)
        except Exception:
            pass
    with _local_lock:
        for key in keys:
            _local.pop(key, None)
