import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Counters are kept in Redis so that limits hold across all API processes;
# if Redis is unreachable slowapi falls back to per-process memory.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.getenv("REDIS_URL", "memory://"),
    in_memory_fallback_enabled=True,
    swallow_errors=True,
)
