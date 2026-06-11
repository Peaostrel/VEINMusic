import asyncio
import os
import logging
from contextlib import asynccontextmanager
import redis.asyncio as aioredis
from fastapi import HTTPException
from arq import create_pool
from arq.connections import RedisSettings

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = None
arq_pool = None

# A dictionary to hold local locks as fallback
_LOCAL_LOCKS = {}
_LOCAL_LOCKS_LOCK = asyncio.Lock()

def get_redis_client():
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
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
        await client.ping()
        redis_lock_obj = client.lock(lock_key, timeout=expire_sec)
        # Try to acquire the lock with a timeout of 5 seconds
        acquired = await redis_lock_obj.acquire(blocking=True, blocking_timeout=5)
        if not acquired:
            raise TimeoutError("Lock is busy")
    except (aioredis.ConnectionError, OSError) as e:
        use_fallback = True
        logging.warning(f"Redis connection failed for lock '{lock_key}' ({e}). Falling back to local lock.")
    except TimeoutError:
        # Lock is busy on an active Redis instance. Do NOT fallback. Raise an error.
        raise HTTPException(status_code=409, detail="Ресурс временно заблокирован, попробуйте позже")

    if use_fallback:
        local_lock = await get_local_lock(lock_key)
        async with local_lock:
            yield
    else:
        try:
            yield
        finally:
            try:
                await redis_lock_obj.release()
            except Exception as e:
                logging.error(f"Failed to release Redis lock '{lock_key}': {e}")

async def get_arq_pool():
    global arq_pool
    if arq_pool is None:
        try:
            settings = RedisSettings.from_dsn(REDIS_URL)
            arq_pool = await create_pool(settings)
        except Exception as e:
            logging.warning(f"Failed to initialize arq Redis pool: {e}")
            arq_pool = None
    return arq_pool

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
        except Exception as e:
            logging.error(f"Failed to enqueue job '{job_name}' to arq: {e}. Falling back to local/inline background tasks.")
            
    # Fallback mechanisms
    if background_tasks:
        if job_name == 'check_achievements':
            from app.routers.extended import run_check_achievements_bg
            background_tasks.add_task(run_check_achievements_bg, *args)
            return True
    else:
        if job_name == 'check_achievements':
            from app.routers.extended import run_check_achievements_bg
            # Execute synchronously in a worker thread to avoid blocking the asyncio event loop
            asyncio.create_task(asyncio.to_thread(run_check_achievements_bg, *args))
            return True
    return False
