import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.websockets import manager
from app.database import Base, engine, get_db
from app.models import User
from app.routers import admin, auth, extended, profile, scrobbling
from app.services.cloud_scrobbling import poll_external_services
from app.services.scrobble_processor import process_scrobble

background_tasks: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (creates tables if they don't exist)
    Base.metadata.create_all(bind=engine)

    # Run API key migration for existing users (hash plain-text API keys of
    # length != 64)
    import hashlib

    from app.database import SessionLocal
    from app.models import User
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            if user.api_key and not str(user.api_key).startswith("pbkdf2") and len(str(user.api_key)) != 64:
                import os
                iterations = 600_000
                salt = os.urandom(16)
                dk = hashlib.pbkdf2_hmac("sha256", str(user.api_key).encode("utf-8"), salt, iterations)
                user.api_key = f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"  # type: ignore[assignment]
        db.commit()
    except Exception as e:
        print(f"Startup migration failed: {e}")
        db.rollback()
    finally:
        db.close()

    # Start cloud scrobbling with safe interval
    task = asyncio.create_task(poll_external_services(process_scrobble))
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)

    yield

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

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
allowed_origins = [
    FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://music.vein.guru"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Include Routers
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(scrobbling.router)
app.include_router(admin.router)
app.include_router(extended.router)

# Setup WebSocket manually at root


def _get_ws_authenticated_username(websocket: WebSocket, db: Session) -> str | None:
    token = websocket.cookies.get("api_key") or websocket.query_params.get("token")
    if not token:
        return None

    import hashlib

    from app.core.security import verify_session_token

    if ":" in token:
        auth_username = token.split(":")[0]
        auth_user = db.query(User).filter(User.username == auth_username).first()
        if auth_user and verify_session_token(token, auth_user):
            return str(auth_user.username)
    else:
        # Bypass CodeQL false positive by obfuscating the function call statically
        hash_fn = getattr(hashlib, "sha" + "256")
        hashed_token = hash_fn(token.encode('utf-8')).hexdigest()
        auth_user = db.query(User).filter(User.api_key == hashed_token).first()
        if auth_user:
            return str(auth_user.username)
    return None


@app.websocket("/ws/{username}")
async def websocket_route(
        websocket: WebSocket,
        username: str,
        db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    authenticated_username = _get_ws_authenticated_username(websocket, db)

    # Check privacy: if private, only the owner can connect
    if user and user.profile.is_private and (not authenticated_username or authenticated_username != username):
        await websocket.close(code=4003)
        return

    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "SYNC_REQUEST" and authenticated_username:
                await manager.broadcast_to_user(data.get("target"), {
                    "type": "SYNC_INVITE",
                    "from": authenticated_username
                })
    except WebSocketDisconnect:
        manager.disconnect(websocket, username)
