import os
import asyncio
import secrets
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.database import engine, Base
from app.routers import auth, profile, scrobbling, admin, extended
from app.services.cloud_scrobbling import poll_external_services
from app.services.scrobble_processor import process_scrobble
from app.core.websockets import manager

# Setup Rate Limiting
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="VEIN Music API")
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

background_tasks = set()

@app.on_event("startup")
async def startup_event():
    # Initialize DB (creates tables if they don't exist)
    Base.metadata.create_all(bind=engine)
    
    # Start cloud scrobbling with safe interval
    task = asyncio.create_task(poll_external_services(process_scrobble))
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)

# Setup WebSocket manually at root
from fastapi import WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User

@app.websocket("/ws/{username}")
async def websocket_route(websocket: WebSocket, username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if user and user.profile.is_private:
        # We check cookies first, then token for extensions
        token = websocket.cookies.get("api_key") or websocket.query_params.get("token")
        if not token or not user.api_key or not secrets.compare_digest(token, user.api_key):
            await websocket.close(code=4003)
            return

    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "SYNC_REQUEST":
                target = data.get("target")
                await manager.broadcast_to_user(target, {
                    "type": "SYNC_INVITE",
                    "from": username
                })
    except WebSocketDisconnect:
        manager.disconnect(websocket, username)
