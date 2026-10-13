"""Keeps API-key checks cheap for everyone except the key owner.

Personal and developer keys are stored as PBKDF2 hashes (100 000 rounds,
~70 ms of CPU). Computing that for every request let anyone keep the API's
CPU busy with made-up keys. Now:

* a key that verified recently is found in an in-memory table (only in
  this process, for five minutes) and re-checked against the stored hash,
  so a regenerated or revoked key stops working at once;
* a client that keeps sending wrong keys is refused before any PBKDF2 runs;
* only a few PBKDF2 computations run at the same time.
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict

from fastapi import HTTPException

CACHE_TTL_SEC = 300
CACHE_MAX_ENTRIES = 10_000
MAX_FAILURES = 20  # wrong keys per client IP ...
FAILURE_WINDOW_SEC = 600  # ... within this window
MAX_CONCURRENT_HASHES = 4
_LOCAL_MAX_COUNTERS = 10_000

_cache: OrderedDict[str, tuple[int, str, float]] = OrderedDict()
_cache_lock = threading.Lock()
_hash_slots = threading.BoundedSemaphore(MAX_CONCURRENT_HASHES)
_local_failures: dict[str, tuple[int, float]] = {}
_local_lock = threading.Lock()


def cached(token: str) -> tuple[int, str] | None:
    """(owner id, stored hash) of a key that verified recently."""
    with _cache_lock:
        entry = _cache.get(token)
        if entry is None:
            return None
        if entry[2] <= time.time():
            _cache.pop(token, None)
            return None
        _cache.move_to_end(token)
        return entry[0], entry[1]


def remember(token: str, owner_id: int, stored_hash: str) -> None:
    with _cache_lock:
        _cache[token] = (owner_id, stored_hash, time.time() + CACHE_TTL_SEC)
        _cache.move_to_end(token)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)


def forget(token: str) -> None:
    with _cache_lock:
        _cache.pop(token, None)


def _redis():
    from app.services.cache import redis_client
    return redis_client


def _failures(ip: str) -> int:
    client = _redis()
    if client is not None:
        try:
            return int(client.get(f"keyfail:{ip}") or 0)
        except Exception:
            pass
    with _local_lock:
        count, expires = _local_failures.get(ip, (0, 0.0))
        return count if expires > time.time() else 0


def register_failure(ip: str | None) -> None:
    if not ip:
        return
    client = _redis()
    if client is not None:
        try:
            pipe = client.pipeline()
            pipe.incr(f"keyfail:{ip}")
            pipe.expire(f"keyfail:{ip}", FAILURE_WINDOW_SEC, nx=True)
            pipe.execute()
            return
        except Exception:
            pass
    with _local_lock:
        count, expires = _local_failures.get(ip, (0, 0.0))
        if expires <= time.time():
            count, expires = 0, time.time() + FAILURE_WINDOW_SEC
        if len(_local_failures) >= _LOCAL_MAX_COUNTERS and ip not in _local_failures:
            _local_failures.clear()
        _local_failures[ip] = (count + 1, expires)


def check_allowed(ip: str | None) -> None:
    """Refuse a client that sent too many wrong keys, before hashing."""
    if ip and _failures(ip) >= MAX_FAILURES:
        raise HTTPException(429, "Слишком много запросов с неверным ключом, попробуйте позже")


def slow_hash(compute):
    """Run a PBKDF2 computation, a few at a time."""
    if not _hash_slots.acquire(timeout=5):
        raise HTTPException(503, "Сервер занят, повторите запрос")
    try:
        return compute()
    finally:
        _hash_slots.release()


def reset() -> None:
    """Tests: forget cached keys and failure counters."""
    with _cache_lock:
        _cache.clear()
    with _local_lock:
        _local_failures.clear()
