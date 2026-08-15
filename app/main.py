import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.websockets import manager
from app.database import Base, engine, get_db
from app.models import User
from app.routers import admin, auth, developer, extended, profile, scrobbling, widgets
from app.services.cloud_scrobbling import poll_external_services
from app.services.scrobble_processor import process_scrobble

background_tasks: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (creates tables if they don't exist)
    Base.metadata.create_all(bind=engine)

    from app.core.security import SECRET_KEY
    if os.getenv("ENVIRONMENT") == "production" and SECRET_KEY == "super-secret-vein-key-change-it-in-production":
        raise RuntimeError("CRITICAL SECURITY ERROR: Using default SECRET_KEY in production!")

    # Run API key migration for existing users (hash plain-text API keys of
    # length != 64)
    import hashlib

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        users = db.query(User).all()
        from app.core.security import SECRET_KEY
        for user in users:
            if user.api_key and len(str(user.api_key)) != 64:
                # Hash plain-text API keys correctly using the deterministic format
                if not str(user.api_key).startswith("pbkdf2"):
                    dk = hashlib.pbkdf2_hmac('sha256', str(user.api_key).encode('utf-8'), SECRET_KEY.encode(), 100000)
                    user.api_key = dk.hex()  # type: ignore[assignment]
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
app.include_router(widgets.router)
app.include_router(developer.router)

# Setup WebSocket manually at root


def _get_ws_authenticated_username(websocket: WebSocket, db: Session) -> str | None:
    token = websocket.cookies.get("api_key") or websocket.query_params.get("token")
    if not token:
        return None

    from app.core.security import _authenticate_user

    auth_user = _authenticate_user(token, db)
    if auth_user:
        return str(auth_user.username)
    return None


def _is_sync_allowed(target_user, sender_username: str, db: Session) -> bool:
    if not target_user.profile:
        return False
    sp = target_user.profile.sync_privacy
    if sp == "all" or sp is None:
        return True
    if sp == "followers":
        from app.models import Follow, User
        sender_user = db.query(User).filter(User.username == sender_username).first()
        if sender_user:
            return db.query(Follow).filter(
                Follow.follower_id == target_user.id,
                Follow.following_id == sender_user.id
            ).first() is not None
    return False


async def _handle_sync_request(target: str, sender_username: str, db: Session):
    from app.models import User
    target_user = db.query(User).filter(User.username == target).first()
    if target_user and _is_sync_allowed(target_user, sender_username, db):
        await manager.broadcast_to_user(target, {
            "type": "SYNC_INVITE",
            "from": sender_username
        })


@app.websocket("/ws/{username}")
async def websocket_route(
        websocket: WebSocket,
        username: str,
        db: Session = Depends(get_db)):
    authenticated_username = _get_ws_authenticated_username(websocket, db)

    # Enforce authentication: only the owner can connect to their own websocket
    if not authenticated_username or authenticated_username != username:
        await websocket.close(code=4003)
        return

    import time
    last_sync_request = 0.0

    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "SYNC_REQUEST" and authenticated_username:
                now = time.time()
                if now - last_sync_request < 10.0:
                    continue  # Rate limit: 1 request per 10 seconds
                last_sync_request = now
                target = data.get("target")
                if target:
                    await _handle_sync_request(target, authenticated_username, db)
    except Exception:
        pass
    finally:
        manager.disconnect(websocket, username)


@app.websocket("/ws/together/{room_id}")
async def together_websocket_route(
    websocket: WebSocket,
    room_id: str,
    db: Session = Depends(get_db),
):
    import time
    username = _get_ws_authenticated_username(websocket, db) or f"Guest_{int(time.time()) % 1000}"

    await websocket.accept()
    room = manager.get_or_create_room(room_id, host_username=username)
    room.add_listener(username, websocket)

    # Send current room state to newly joined user
    await websocket.send_json({
        "type": "ROOM_STATE",
        "room_id": room_id,
        "name": room.name,
        "host": room.host_username,
        "current_track": room.current_track,
        "listeners": list(room.listeners.keys()),
        "chat_history": room.chat_messages[-30:],
    })

    # Broadcast user joined to other listeners
    await room.broadcast({
        "type": "USER_JOINED",
        "username": username,
        "listeners": list(room.listeners.keys()),
    }, exclude_user=username)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "TRACK_SYNC":
                track_data = data.get("track", {})
                room.current_track.update(track_data)
                room.current_track["updated_at"] = time.time()
                await room.broadcast({
                    "type": "TRACK_SYNC",
                    "track": room.current_track,
                    "from": username,
                })

            elif msg_type == "CHAT_MESSAGE":
                text = str(data.get("text", "")).strip()
                if text:
                    msg_obj = {
                        "from": username,
                        "text": text[:500],
                        "timestamp": int(time.time()),
                    }
                    room.chat_messages.append(msg_obj)
                    await room.broadcast({
                        "type": "CHAT_MESSAGE",
                        **msg_obj,
                    })

            elif msg_type == "PLAYBACK_CONTROL":
                is_playing = bool(data.get("is_playing"))
                progress_sec = float(data.get("progress_sec", 0))
                room.current_track["is_playing"] = is_playing
                room.current_track["progress_sec"] = progress_sec
                room.current_track["updated_at"] = time.time()
                await room.broadcast({
                    "type": "PLAYBACK_CONTROL",
                    "is_playing": is_playing,
                    "progress_sec": progress_sec,
                    "from": username,
                })
    except Exception:
        pass
    finally:
        room.remove_listener(username)
        await room.broadcast({
            "type": "USER_LEFT",
            "username": username,
            "listeners": list(room.listeners.keys()),
        })
