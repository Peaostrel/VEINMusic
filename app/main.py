import asyncio
import logging
import math
import os
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import anyio
from fastapi import FastAPI, WebSocket
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.body_limit import BodySizeLimitMiddleware
from app.core.flood_guard import FloodGuardMiddleware
from app.core.observability import setup_observability
from app.core.performance import record_request
from app.core.rate_limit import limiter
from app.core.websockets import manager
from app.database import Base, SessionLocal, engine
from app.models import User
from app.routers import (
    account,
    admin,
    admin_data,
    admin_security,
    admin_tools,
    auth,
    developer,
    devices,
    email,
    extended,
    geo,
    lastfm_connect,
    notifications,
    portability,
    preview,
    profile,
    reports,
    scrobbling,
    vk_id,
    widgets,
)
from app.services.cloud_scrobbling import poll_external_services
from app.services.scrobble_processor import process_scrobble

setup_observability("api")

background_tasks: set[asyncio.Task] = set()
logger = logging.getLogger(__name__)

# Value of SECRET_KEY in .env.example (must never reach a running server)
ENV_EXAMPLE_SECRET_KEY = "change_me_to_a_long_random_string"


def _migrate_plaintext_api_keys() -> None:
    """Hash legacy plain-text API keys (anything that is not a 64-char hex digest)."""
    import hashlib

    from sqlalchemy import func

    from app.core.security import SECRET_KEY

    db = SessionLocal()
    try:
        users = db.query(User).filter(
            User.api_key.isnot(None), func.length(User.api_key) != 64).all()
        for user in users:
            if not str(user.api_key).startswith("pbkdf2"):
                dk = hashlib.pbkdf2_hmac('sha256', str(user.api_key).encode('utf-8'), SECRET_KEY.encode(), 100000)
                user.api_key = dk.hex()  # type: ignore[assignment]
        db.commit()
    except Exception:
        logger.exception("Startup API key migration failed")
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The schema is managed by Alembic (`alembic upgrade head`, run by the
    # Docker entrypoint). Creating tables directly is only a convenience for
    # local SQLite development, where the Postgres migrations can't run.
    if engine.dialect.name == "sqlite" or os.getenv("AUTO_CREATE_TABLES") == "1":
        Base.metadata.create_all(bind=engine)

    from app.core.security import SECRET_KEY
    # The .env.example placeholder can only get here by copying the example
    # file unchanged, so it is refused in every environment. The built-in
    # default (no SECRET_KEY at all) is tolerated only outside production.
    if SECRET_KEY == ENV_EXAMPLE_SECRET_KEY:
        raise RuntimeError("SECRET_KEY still has the placeholder value from .env.example: set a random key")
    insecure_keys = {"super-secret-vein-key-change-it-in-production", ENV_EXAMPLE_SECRET_KEY}
    if os.getenv("ENVIRONMENT") == "production" and (SECRET_KEY in insecure_keys or len(SECRET_KEY) < 32):
        raise RuntimeError("CRITICAL SECURITY ERROR: SECRET_KEY is a default/weak value in production!")

    _migrate_plaintext_api_keys()

    # Cloud scrobbling (Spotify / Yandex / SoundCloud polling). In Docker it runs in the
    # arq worker instead (RUN_CLOUD_POLLING=0), so that several API workers
    # don't poll the same accounts.
    if os.getenv("RUN_CLOUD_POLLING", "1") == "1":
        task = asyncio.create_task(poll_external_services(process_scrobble))
        background_tasks.add(task)
        task.add_done_callback(background_tasks.discard)

    # Relay WebSocket events published by other processes (Redis pub/sub)
    await manager.start()

    yield

    await manager.stop()

    # Cancel background tasks on shutdown
    for t in set(background_tasks):
        t.cancel()

    from app.core import redis
    if redis.arq_pool:
        await redis.arq_pool.close()

# Setup Rate Limiting
app = FastAPI(title="VEIN Music API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]


def _finite(value: float) -> float | None:
    return value if math.isfinite(value) else None


@app.exception_handler(RequestValidationError)
async def _validation_error(request, exc: RequestValidationError):
    """FastAPI's own 422, except that a NaN or infinity echoed back from the
    request (JSON has no such numbers) no longer turns it into a 500."""
    errors = jsonable_encoder(exc.errors(), custom_encoder={float: _finite})
    return JSONResponse(status_code=422, content={"detail": errors})

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
allowed_origins = [FRONTEND_URL, "https://music.vein.guru"]
if os.getenv("ENVIRONMENT") != "production":
    # Local development only: in production any page a visitor happens to run
    # on localhost (a dev server, a malicious tool) must not act as the site
    allowed_origins += ["http://localhost:3000", "http://127.0.0.1:3000"]

_API_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'"
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def security_headers(request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        route = getattr(request.scope.get("route"), "path", None) or "<unmatched>"
        record_request(route, elapsed_ms, 500)
        raise
    elapsed_ms = (time.perf_counter() - started) * 1000
    route = getattr(request.scope.get("route"), "path", None) or "<unmatched>"
    record_request(route, elapsed_ms, response.status_code)
    headers = response.headers
    headers.setdefault("Server-Timing", f"app;dur={elapsed_ms:.1f}")
    headers.setdefault("X-Response-Time", f"{elapsed_ms:.1f}ms")
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if not request.url.path.startswith(_DOCS_PATHS):
        # The API only serves JSON, images and SVG widgets: nothing may run
        headers.setdefault("Content-Security-Policy", _API_CSP)
    if os.getenv("ENVIRONMENT") == "production":
        headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


# Refuse oversized bodies before any other code reads them
app.add_middleware(BodySizeLimitMiddleware)
# A per-IP ceiling for the whole API
app.add_middleware(FloodGuardMiddleware)
# Outermost, so refusals (413, 429) also carry CORS headers and the site can
# show them instead of a network error
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Server-Timing", "X-Response-Time"],
)


# Include Routers
app.include_router(auth.router)
app.include_router(vk_id.router)
app.include_router(email.router)
app.include_router(profile.router)
app.include_router(scrobbling.router)
app.include_router(admin.router)
app.include_router(admin_tools.router)
app.include_router(admin_security.router)
app.include_router(admin_data.router)
app.include_router(extended.router)
app.include_router(widgets.router)
app.include_router(developer.router)
app.include_router(devices.router)
app.include_router(account.router)
app.include_router(portability.router)
app.include_router(notifications.router)
app.include_router(reports.router)
app.include_router(lastfm_connect.router)
app.include_router(geo.router)
app.include_router(preview.router)


_full_openapi = app.openapi


def _public_openapi() -> dict:
    """The public API description, without the admin panel's endpoints in
    production: they stay protected, but there is no reason to hand out a
    map of them. Development keeps the full schema."""
    schema = _full_openapi()
    if os.getenv("ENVIRONMENT") != "production":
        return schema
    return {**schema, "paths": {path: item for path, item in schema["paths"].items()
                                if not path.startswith("/api/admin")}}


app.openapi = _public_openapi  # type: ignore[method-assign]


@app.get("/health", tags=["health"], responses={503: {"description": "A dependency is down"}})
async def health():
    """Liveness/readiness probe: checks the database and (optionally) Redis."""
    from fastapi.responses import JSONResponse
    from sqlalchemy import text

    from app.core.redis import get_redis_client

    checks: dict[str, str] = {}

    def _check_db() -> None:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    try:
        await asyncio.to_thread(_check_db)
        checks["database"] = "ok"
    except Exception:
        logger.exception("Health check: database unavailable")
        checks["database"] = "error"

    try:
        await asyncio.wait_for(get_redis_client().ping(), timeout=2)
        checks["redis"] = "ok"
    except Exception:
        # Redis is optional (in-memory fallbacks exist), so it's reported
        # but doesn't make the service unhealthy.
        checks["redis"] = "unavailable"

    healthy = checks["database"] == "ok"
    return JSONResponse(status_code=200 if healthy else 503,
                        content={"status": "ok" if healthy else "error", "checks": checks})


# Setup WebSocket manually at root



def _is_ws_origin_allowed(websocket: WebSocket) -> bool:
    # Browsers always send Origin for WebSocket handshakes; reject foreign
    # origins to prevent cross-site WebSocket hijacking.
    origin = websocket.headers.get("origin")
    return origin is None or origin in allowed_origins


def _get_ws_authenticated_username(websocket: WebSocket) -> str | None:
    ticket = websocket.query_params.get("ticket")
    cookie_token = websocket.cookies.get("api_key")
    token = cookie_token or websocket.query_params.get("token")
    if not ticket and not token:
        return None

    from app.core.security import _authenticate_user_with_scopes

    # Use a short-lived session: a Depends(get_db) session would keep a pooled
    # DB connection checked out for the whole lifetime of the WebSocket.
    db = SessionLocal()
    try:
        if ticket:
            from app.core.ws_ticket import ticket_session_id
            websocket.state.session_id = ticket_session_id(ticket)
            return _get_ticket_username(ticket, db)
        if not token:
            return None
        client_ip = websocket.client.host if websocket.client else None
        auth_user, scopes = _authenticate_user_with_scopes(token, db, client_ip)
        if scopes is None and not cookie_token:
            # Addresses end up in proxy logs: a session travels in the cookie
            # or as a one-time ticket, ?token= is only for API keys.
            return None
        if scopes is not None and not {"profile:read", "*"}.intersection(scopes.split(",")):
            return None
        if auth_user and not auth_user.is_banned:
            parts = token.split(":")
            websocket.state.session_id = parts[2] if len(parts) == 4 else None
            return str(auth_user.username)
        return None
    finally:
        db.close()


def _get_ticket_username(ticket: str, db) -> str | None:
    from app.core.ws_ticket import ticket_session_id, verify_ticket
    username = verify_ticket(ticket)
    user = db.query(User).filter(User.username == username).first() if username else None
    if user and not user.is_banned and verify_ticket(ticket, session_version=int(user.session_version or 0)):
        session_id = ticket_session_id(ticket)
        if session_id:
            from app.core.security import _as_aware
            from app.models import UserSession
            session = db.get(UserSession, session_id)
            if not session or session.user_id != user.id or session.revoked or session.session_version != user.session_version or _as_aware(session.expires_at) <= datetime.now(UTC):
                return None
        return str(user.username)
    return None


@app.websocket("/ws/{username}")
async def websocket_route(websocket: WebSocket, username: str):
    if not _is_ws_origin_allowed(websocket):
        await websocket.close(code=4003)
        return

    authenticated_username = await anyio.to_thread.run_sync(
        _get_ws_authenticated_username, websocket)
    if not authenticated_username or authenticated_username != username:
        await websocket.close(code=4003)
        return

    await manager.connect(websocket, username)
    try:
        while True:
            await websocket.receive()
    except Exception:
        pass
    finally:
        manager.disconnect(websocket, username)
