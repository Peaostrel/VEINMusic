"""Small JSON cache backed by Redis with an in-memory fallback."""

import json
import os
import time
from typing import Any

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
# While Redis is down, try to reconnect at most this often
RECONNECT_INTERVAL_SEC = 30
redis_client = None
_reconnect_at = 0.0


def _connect():
    """Connect to Redis, or set the next reconnect attempt. Other modules read
    `redis_client` at call time, so they pick up a restored connection too."""
    global redis_client, _reconnect_at
    try:
        client = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
        client.ping()
        redis_client = client
    except Exception as e:
        import logging
        logging.warning(f"Redis is not available, falling back to in-memory cache: {e}")
        redis_client = None
        _reconnect_at = time.time() + RECONNECT_INTERVAL_SEC


def _redis():
    if redis_client is None and time.time() >= _reconnect_at:
        _connect()
    return redis_client


_connect()

CACHE: dict[str, Any] = {}
MAX_CACHE_SIZE = 500
# Namespaces the keys in Redis so clear_all() drops only this cache
KEY_PREFIX = "cache:"


def _get_from_redis(key: str, ttl: int):
    redis_client = _redis()
    if not redis_client:
        return None
    try:
        val = redis_client.get(KEY_PREFIX + key)
        if val is not None:
            entry = json.loads(str(val))
            if time.time() - entry.get('ts', 0) < ttl:
                return entry.get('data')
            else:
                try:
                    redis_client.delete(KEY_PREFIX + key)
                except Exception:
                    pass
        return None
    except Exception as e:
        import logging
        logging.warning(
            f"Redis error in get_from_cache: {e}. Falling back to in-memory.")
    return None


def get_from_cache(key: str, ttl: int = 300):
    val = _get_from_redis(key, ttl)
    if val is not None:
        return val

    if key in CACHE:
        entry = CACHE[key]
        if time.time() - entry['ts'] < ttl:
            return entry['data']
        else:
            del CACHE[key]
    return None


def set_to_cache(key: str, data: Any, expire: int = 3600):
    """Store `data`; Redis drops it after `expire` seconds (get_from_cache's
    ttl decides freshness, so expire should be at least that ttl)."""
    now = time.time()
    entry = {'data': data, 'ts': now}
    redis_client = _redis()
    if redis_client:
        try:
            redis_client.set(KEY_PREFIX + key, json.dumps(entry), ex=expire)
            return
        except Exception as e:
            import logging
            logging.warning(
                f"Redis error in set_to_cache: {e}. Falling back to in-memory.")

    if len(CACHE) >= MAX_CACHE_SIZE:
        expired_keys = [k for k, v in CACHE.items() if now - v['ts'] >= 300]
        for k in expired_keys:
            del CACHE[k]
        if len(CACHE) >= MAX_CACHE_SIZE:
            oldest_key = min(CACHE.keys(), key=lambda k: CACHE[k]['ts'])
            del CACHE[oldest_key]
    CACHE[key] = entry


def delete_from_cache(key: str) -> None:
    CACHE.pop(key, None)
    redis_client = _redis()
    if redis_client:
        try:
            redis_client.delete(KEY_PREFIX + key)
        except Exception as e:
            import logging
            logging.warning(f"Redis error in delete_from_cache: {e}")


def clear_all() -> int:
    """Drop every cached entry (Redis and in-memory). Returns the count."""
    removed = len(CACHE)
    CACHE.clear()
    redis_client = _redis()
    if redis_client:
        keys = list(redis_client.scan_iter(match=KEY_PREFIX + "*", count=500))
        if keys:
            removed += int(redis_client.delete(*keys))  # type: ignore[arg-type]
    return removed


# Entries built from one user's own listening or profile. Everything else is
# shared (leaderboards, feeds, artist pages): it expires on its own short TTL
# and every read rechecks privacy, so a user's change never has to flush it.
USER_PREVIEW_KEY = "preview:user:{username}"
TASTE_TWINS_KEY = "taste_twins:v2:{username}"


def invalidate_user(username: str) -> None:
    """Forget the cached entries of one user after they change their history,
    privacy or preferences (their detailed stats are keyed by a version of the
    history and refresh by themselves)."""
    for template in (USER_PREVIEW_KEY, TASTE_TWINS_KEY):
        delete_from_cache(template.format(username=username))
