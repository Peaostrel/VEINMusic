import hashlib
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
    """Rate-limit key per credential (API key / session), falling back to IP.

    Used where many legitimate users may share one IP (NAT), so a per-IP
    limit would be too tight while a per-account one still stops abuse."""
    token = (
        request.headers.get("X-API-Key")
        or request.cookies.get("api_key")
        or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    )
    if token:
        return "cred:" + hashlib.sha256(token.encode("utf-8")).hexdigest()[:32]
    return get_remote_address(request)
