import asyncio
import os
import re
import secrets
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.websockets import manager
from app.database import Base, SessionLocal, engine
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
    insecure_keys = {"super-secret-vein-key-change-it-in-production", "change_me_to_a_long_random_string"}
    if os.getenv("ENVIRONMENT") == "production" and (SECRET_KEY in insecure_keys or len(SECRET_KEY) < 32):
        raise RuntimeError("CRITICAL SECURITY ERROR: SECRET_KEY is a default/weak value in production!")

    # Run API key migration for existing users (hash plain-text API keys of
    # length != 64)
    import hashlib

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

MAX_CHAT_HISTORY = 100
MAX_TEXT_FIELD_LENGTH = 300
_ROOM_ID_RE = re.compile(r"^[\w\-. ]{1,64}$", re.UNICODE)


def _is_ws_origin_allowed(websocket: WebSocket) -> bool:
    # Browsers always send Origin for WebSocket handshakes; reject foreign
    # origins to prevent cross-site WebSocket hijacking.
    origin = websocket.headers.get("origin")
    return origin is None or origin in allowed_origins


def _get_ws_authenticated_username(websocket: WebSocket) -> str | None:
    token = websocket.cookies.get("api_key") or websocket.query_params.get("token")
    if not token:
        return None

    from app.core.security import _authenticate_user

    # Use a short-lived session: a Depends(get_db) session would keep a pooled
    # DB connection checked out for the whole lifetime of the WebSocket.
    db = SessionLocal()
    try:
        auth_user = _authenticate_user(token, db)
        if auth_user and not auth_user.is_banned:
            return str(auth_user.username)
        return None
    finally:
        db.close()


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


async def _handle_sync_request(target: str, sender_username: str):
    from app.models import User
    db = SessionLocal()
    try:
        target_user = db.query(User).filter(User.username == target).first()
        allowed = bool(target_user and _is_sync_allowed(target_user, sender_username, db))
    finally:
        db.close()
    if allowed:
        await manager.broadcast_to_user(target, {
            "type": "SYNC_INVITE",
            "from": sender_username
        })


@app.websocket("/ws/{username}")
async def websocket_route(websocket: WebSocket, username: str):
    if not _is_ws_origin_allowed(websocket):
        await websocket.close(code=4003)
        return

    authenticated_username = _get_ws_authenticated_username(websocket)

    # Enforce authentication: only the owner can connect to their own websocket
    if not authenticated_username or authenticated_username != username:
        await websocket.close(code=4003)
        return

    last_sync_request = 0.0

    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue
            if data.get("type") == "SYNC_REQUEST":
                now = time.time()
                if now - last_sync_request < 10.0:
                    continue  # Rate limit: 1 request per 10 seconds
                last_sync_request = now
                target = data.get("target")
                if isinstance(target, str) and target:
                    await _handle_sync_request(target, authenticated_username)
    except Exception:
        pass
    finally:
        manager.disconnect(websocket, username)


def _clean_track_update(track_data) -> dict:
    """Keep only known track fields with sane types/lengths from a client TRACK_SYNC."""
    if not isinstance(track_data, dict):
        return {}
    clean: dict = {}
    for key in ("title", "artist", "album"):
        val = track_data.get(key)
        if isinstance(val, str):
            clean[key] = val[:MAX_TEXT_FIELD_LENGTH]
    cover = track_data.get("cover_url")
    if isinstance(cover, str) and cover.startswith(("http://", "https://")):
        clean["cover_url"] = cover[:2048]
    for key in ("duration", "progress_sec"):
        val = track_data.get(key)
        if isinstance(val, (int, float)) and not isinstance(val, bool) and 0 <= val < 86400:
            clean[key] = val
    if isinstance(track_data.get("is_playing"), bool):
        clean["is_playing"] = track_data["is_playing"]
    return clean


async def _handle_room_message(room, username: str, data: dict, state: dict) -> None:
    msg_type = data.get("type")
    is_host = username == room.host_username

    if msg_type == "TRACK_SYNC" and is_host:
        room.current_track.update(_clean_track_update(data.get("track")))
        room.current_track["updated_at"] = time.time()
        await room.broadcast({
            "type": "TRACK_SYNC",
            "track": room.current_track,
            "from": username,
        })

    elif msg_type == "CHAT_MESSAGE":
        now = time.time()
        if now - state["last_chat"] < 0.5:
            return  # simple per-connection flood protection
        state["last_chat"] = now
        text = str(data.get("text", "")).strip()
        if text:
            msg_obj = {
                "from": username,
                "text": text[:500],
                "timestamp": int(now),
            }
            room.add_chat_message(msg_obj, MAX_CHAT_HISTORY)
            await room.broadcast({
                "type": "CHAT_MESSAGE",
                **msg_obj,
            })

    elif msg_type == "PLAYBACK_CONTROL" and is_host:
        try:
            progress_sec = float(data.get("progress_sec", 0))
        except (TypeError, ValueError):
            return
        if not 0 <= progress_sec < 86400:
            return
        is_playing = bool(data.get("is_playing"))
        room.current_track["is_playing"] = is_playing
        room.current_track["progress_sec"] = progress_sec
        room.current_track["updated_at"] = time.time()
        await room.broadcast({
            "type": "PLAYBACK_CONTROL",
            "is_playing": is_playing,
            "progress_sec": progress_sec,
            "from": username,
        })


@app.websocket("/ws/together/{room_id}")
async def together_websocket_route(websocket: WebSocket, room_id: str):
    if not _is_ws_origin_allowed(websocket) or not _ROOM_ID_RE.match(room_id):
        await websocket.close(code=4003)
        return

    username = _get_ws_authenticated_username(websocket) or f"Guest_{secrets.token_hex(3)}"

    room = manager.get_or_create_room(room_id, host_username=username)
    if room is None or not room.has_capacity():
        await websocket.close(code=4008)
        return

    await websocket.accept()
    room.add_listener(username, websocket)

    # Send current room state to newly joined user
    await websocket.send_json({
        "type": "ROOM_STATE",
        "room_id": room_id,
        "name": room.name,
        "host": room.host_username,
        "you": username,
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

    state = {"last_chat": 0.0}
    try:
        while True:
            data = await websocket.receive_json()
            if isinstance(data, dict):
                await _handle_room_message(room, username, data, state)
    except Exception:
        pass
    finally:
        room.remove_listener(username, websocket)
        if not room.listeners:
            manager.remove_room(room_id)
        else:
            await room.broadcast({
                "type": "USER_LEFT",
                "username": username,
                "listeners": list(room.listeners.keys()),
            })
