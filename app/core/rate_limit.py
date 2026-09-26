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


def credential_key(request) -> str:
    """Rate-limit key per account, falling back to the client IP.

    Used where many legitimate users may share one IP (NAT), so a per-IP
    limit would be too tight while a per-account one still stops abuse.
    slowapi evaluates it after FastAPI resolved the endpoint's dependencies,
    so get_current_user has already recorded the account on request.state."""
    user_id = getattr(request.state, "user_id", None)
    if user_id is not None:
        return f"user:{user_id}"
    return get_remote_address(request)
