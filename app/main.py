from app.models import User
from app.database import get_db
from sqlalchemy.orm import Session
from fastapi import WebSocket, WebSocketDisconnect, Depends
import os
import asyncio
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.database import engine, Base
from app.routers import auth, profile, scrobbling, admin, extended
from app.services.cloud_scrobbling import poll_external_services
from app.services.scrobble_processor import process_scrobble
from app.core.websockets import manager

background_tasks = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (creates tables if they don't exist)
    Base.metadata.create_all(bind=engine)

    # Run API key migration for existing users (hash plain-text API keys of
    # length != 64)
    from app.database import SessionLocal
    import hashlib
    from app.models import User
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            if user.api_key and len(user.api_key) != 64:
                user.api_key = hashlib.sha256(
                    user.api_key.encode('utf-8')).hexdigest()
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
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="VEIN Music API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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


@app.websocket("/ws/{username}")
async def websocket_route(
        websocket: WebSocket,
        username: str,
        db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()

    authenticated_username = None
    token = websocket.cookies.get(
        "api_key") or websocket.query_params.get("token")

    if token:
        import hashlib
        from app.core.security import verify_session_token

        if ":" in token:
            auth_username = token.split(":")[0]
            auth_user = db.query(User).filter(User.username == auth_username).first()
            if auth_user and verify_session_token(token, auth_user):
                authenticated_username = auth_user.username
        else:
            hashed_token = hashlib.sha256(token.encode('utf-8')).hexdigest()
            auth_user = db.query(User).filter(User.api_key == hashed_token).first()
            if auth_user:
                authenticated_username = auth_user.username

    # Check privacy: if private, only the owner can connect
    if user and user.profile.is_private:
        if not authenticated_username or authenticated_username != username:
            await websocket.close(code=4003)
            return

    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "SYNC_REQUEST":
                # Only authenticated users can send sync requests
                if not authenticated_username:
                    continue
                target = data.get("target")
                await manager.broadcast_to_user(target, {
                    "type": "SYNC_INVITE",
                    "from": authenticated_username
                })
    except WebSocketDisconnect:
        manager.disconnect(websocket, username)
