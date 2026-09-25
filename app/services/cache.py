"""Small JSON cache backed by Redis with an in-memory fallback."""

import json
import os
import time
from typing import Any

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = None
try:
    redis_client = redis.Redis.from_url(
        REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=2)
    redis_client.ping()
except Exception as e:
    import logging
    logging.warning(
        f"Redis is not available, falling back to in-memory cache: {e}")
    redis_client = None

CACHE: dict[str, Any] = {}
MAX_CACHE_SIZE = 500


def _get_from_redis(key: str, ttl: int):
    if not redis_client:
        return None
    try:
        val = redis_client.get(key)
        if val is not None:
            entry = json.loads(str(val))
            if time.time() - entry.get('ts', 0) < ttl:
                return entry.get('data')
            else:
                try:
                    redis_client.delete(key)
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


def set_to_cache(key: str, data: Any):
    now = time.time()
    entry = {'data': data, 'ts': now}
    if redis_client:
        try:
            redis_client.set(key, json.dumps(entry), ex=3600)
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
