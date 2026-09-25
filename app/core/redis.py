import asyncio
import logging
import os
import time
from collections.abc import Callable, Coroutine
from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as aioredis
from arq import create_pool
from arq.connections import RedisSettings
from fastapi import HTTPException

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = None
arq_pool = None

# A set to keep a reference to background tasks to prevent garbage collection
_BACKGROUND_TASKS: set[asyncio.Task] = set()

# A dictionary to hold local locks as fallback
_LOCAL_LOCKS: dict[str, asyncio.Lock] = {}
_LOCAL_LOCKS_LOCK = asyncio.Lock()


def get_redis_client():
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2)
    return redis_client


async def get_local_lock(lock_key: str) -> asyncio.Lock:
    async with _LOCAL_LOCKS_LOCK:
        if lock_key not in _LOCAL_LOCKS:
            _LOCAL_LOCKS[lock_key] = asyncio.Lock()
        return _LOCAL_LOCKS[lock_key]


@asynccontextmanager
async def redis_lock(lock_key: str, expire_sec: int = 10):
    """
    Asynchronous context manager for distributed locking.
    Attempts to use Redis. If Redis is down or unavailable, falls back gracefully
    to a local in-memory asyncio.Lock to ensure thread-safety/concurrency control.
    """
    client = get_redis_client()
    redis_lock_obj = None
    use_fallback = False

    try:
        try:
            await client.ping()
        except Exception as e:
            use_fallback = True
            logging.warning(f"Redis connection failed for lock '{lock_key}' ({e}). Falling back to local lock.")

        if not use_fallback:
            redis_lock_obj = client.lock(lock_key, timeout=expire_sec)
            # Try to acquire the lock with a timeout of 5 seconds
            acquired = await redis_lock_obj.acquire(blocking=True, blocking_timeout=5)
            if not acquired:
                raise HTTPException(status_code=409, detail="Ресурс временно заблокирован, попробуйте позже")
    except HTTPException:
        raise
    except Exception as e:
        use_fallback = True
        logging.warning(f"Redis error during lock acquisition '{lock_key}' ({e}). Falling back to local lock.")

    if use_fallback:
        local_lock = await get_local_lock(lock_key)
        async with local_lock:
            yield
    else:
        try:
            yield
        finally:
            try:
                if redis_lock_obj is not None:
                    await redis_lock_obj.release()
            except Exception:
                logging.exception(f"Failed to release Redis lock '{lock_key}'")


_ARQ_RETRY_INTERVAL_SEC = 60.0
_arq_last_failure = 0.0


async def get_arq_pool():
    global arq_pool, _arq_last_failure
    if arq_pool is None:
        # Don't retry the (slow) connection on every call while Redis is down
        if time.monotonic() - _arq_last_failure < _ARQ_RETRY_INTERVAL_SEC:
            return None
        try:
            settings = RedisSettings.from_dsn(REDIS_URL)
            settings.conn_retries = 0
            arq_pool = await create_pool(settings)
        except Exception:
            logging.exception("Failed to initialize arq Redis pool")
            arq_pool = None
            _arq_last_failure = time.monotonic()
    return arq_pool


async def _run_webhook_job(event_name: str, data: dict, user_id: int) -> None:
    from app.database import SessionLocal
    from app.services.webhooks import dispatch_webhook_event
    db = SessionLocal()
    try:
        await dispatch_webhook_event(event_name, data, user_id, db)
    except Exception:
        logging.exception("Webhook dispatch failed")
    finally:
        db.close()


async def _run_lastfm_import_job(job_id: int) -> None:
    from app.services.lastfm_import import run_import_job
    try:
        await run_import_job(job_id)
    except Exception:
        logging.exception("Last.fm import failed")


async def _run_export_job(user_id: int, artist: str, title: str, album, timestamp: int) -> None:
    from app.database import SessionLocal
    from app.services.external_sync import dispatch_external_exports
    db = SessionLocal()
    try:
        await dispatch_external_exports(user_id, artist, title, album, timestamp, db)
    except Exception:
        logging.exception("External scrobble export failed")
    finally:
        db.close()


# In-process fallbacks for async jobs when the arq worker is unavailable
_ASYNC_JOB_FALLBACKS: dict[str, Callable[..., Coroutine[Any, Any, None]]] = {
    'async_dispatch_webhook': _run_webhook_job,
    'async_export_scrobble': _run_export_job,
    'import_lastfm': _run_lastfm_import_job,
}


async def enqueue_background_task(job_name: str, *args, background_tasks=None):
    """
    Enqueue a background job using arq/Redis.
    If Redis is down or unavailable, falls back to FastAPI's BackgroundTasks
    (if available) or runs the synchronous function safely in a separate thread.
    """
    pool = await get_arq_pool()
    if pool:
        try:
            await pool.enqueue_job(job_name, *args)
            return True
        except Exception:
            logging.exception(
                f"Failed to enqueue job '{job_name}' to arq. Falling back to local/inline background tasks.")

    # Fallback mechanisms
    if job_name in _ASYNC_JOB_FALLBACKS:
        task = asyncio.create_task(_ASYNC_JOB_FALLBACKS[job_name](*args))
        _BACKGROUND_TASKS.add(task)
        task.add_done_callback(_BACKGROUND_TASKS.discard)
        return True

    if background_tasks:
        if job_name == 'check_achievements':
            from app.services.achievements import run_check_achievements_bg
            background_tasks.add_task(run_check_achievements_bg, *args)
            return True
    else:
        if job_name == 'check_achievements':
            from app.services.achievements import run_check_achievements_bg
            # Execute safely in a separate thread to avoid blocking the asyncio
            # event loop
            task = asyncio.create_task(
                asyncio.to_thread(
                    run_check_achievements_bg, *args))
            _BACKGROUND_TASKS.add(task)
            task.add_done_callback(_BACKGROUND_TASKS.discard)
            return True
    return False
