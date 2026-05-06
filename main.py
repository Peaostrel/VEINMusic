from fastapi import FastAPI, Depends, HTTPException, Request, BackgroundTasks, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
"""
VEIN Music Backend (Core)
-------------------------
Основной файл бэкенда на FastAPI. 
Отвечает за:
1. API для фронтенда и расширения.
2. Логику скроблинга и подсчета прослушиваний.
3. Систему достижений и уровней.
4. Работу с базой данных (SQLite).
"""
import os
import uuid
import sqlalchemy
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, func, text, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from typing import Optional, List, Dict
import time
import bcrypt
import secrets
import urllib.parse
import re
import httpx
import asyncio
import base64
from dotenv import load_dotenv

load_dotenv()
START_TIME = time.time()

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/auth/spotify/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")
LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/"

DEVELOPERS = set(os.getenv("DEVELOPERS", "peaostrel").split(","))
TESTERS = set(os.getenv("TESTERS", "test_user1,tester_vasya").split(","))

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tracker.db")
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
# Enable foreign key enforcement for SQLite
@sqlalchemy.event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    api_key = Column(String, unique=True, index=True)
    display_name = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    cover_url = Column(String, nullable=True)
    location = Column(String, nullable=True)
    favorite_genre = Column(String, nullable=True)
    equipment = Column(String, nullable=True)
    social_links = Column(String, nullable=True)
    theme = Column(String, default="classic")
    bonus_xp = Column(Integer, default=0)
    current_streak = Column(Integer, default=0)
    last_streak_date = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)
    yandex_token = Column(String, nullable=True)
    lastfm_username = Column(String, nullable=True)
    is_private = Column(Boolean, default=False)
    hidden_artists = Column(String, default="")
    
    favorite_artist = Column(String, nullable=True)
    favorite_artist_url = Column(String, nullable=True)
    favorite_artist_cover = Column(String, nullable=True)
    
    favorite_track = Column(String, nullable=True)
    favorite_track_url = Column(String, nullable=True)
    favorite_track_cover = Column(String, nullable=True)
    favorite_track_review = Column(String, nullable=True)
    favorite_track_rating = Column(Integer, nullable=True)
    
    favorite_album = Column(String, nullable=True)
    favorite_album_url = Column(String, nullable=True)
    favorite_album_cover = Column(String, nullable=True)
    favorite_album_review = Column(String, nullable=True)
    favorite_album_rating = Column(Integer, nullable=True)
    
    spotify_access_token = Column(String, nullable=True)
    spotify_refresh_token = Column(String, nullable=True)
    last_sync = Column(DateTime, nullable=True)

class Track(Base):
    __tablename__ = "tracks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    artist = Column(String, index=True)
    cover_url = Column(String, nullable=True)
    track_url = Column(String, nullable=True)
    album = Column(String, nullable=True)
    genre = Column(String, nullable=True)
    duration = Column(Integer, default=0)

class Scrobble(Base):
    __tablename__ = "scrobbles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"))
    played_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    source = Column(String)
    listened_sec = Column(Integer, default=0)
    is_playing = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)) 
    xp_earned = Column(Integer, default=1)
    is_imported = Column(Boolean, default=False)
class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String)
    icon = Column(String)
    rule_type = Column(String, default="manual") 
    rule_value = Column(Integer, default=0)
    rule_target = Column(String, nullable=True)
    rule_meta = Column(String, nullable=True)
    target_image = Column(String, nullable=True)
    reward_xp = Column(Integer, default=0)

class UserAchievement(Base):
    __tablename__ = "user_achievements"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    achievement_id = Column(Integer, ForeignKey("achievements.id", ondelete="CASCADE"))
    earned_at = Column(DateTime, default=datetime.utcnow)
    is_displayed = Column(Boolean, default=True)
    notified = Column(Boolean, default=False)

class Follow(Base):
    __tablename__ = "follows"
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    following_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

class ScrobbleLike(Base):
    __tablename__ = "scrobble_likes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    scrobble_id = Column(Integer, ForeignKey("scrobbles.id", ondelete="CASCADE"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

class ScrobbleComment(Base):
    __tablename__ = "scrobble_comments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    scrobble_id = Column(Integer, ForeignKey("scrobbles.id", ondelete="CASCADE"))
    content = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

def init_db():
    Base.metadata.create_all(bind=engine)
    # Check existing columns to avoid redundant ALTER TABLE errors
    with engine.connect() as conn:
        inspector = sqlalchemy.inspect(engine)
        
        def add_column_if_missing(table_name, column_name, column_type):
            columns = [c['name'] for c in inspector.get_columns(table_name)]
            if column_name not in columns:
                try:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
                    conn.commit()
                except Exception as e:
                    print(f"Error adding column {column_name} to {table_name}: {e}")

        # Migration mapping
        migrations = [
            ("achievements", "rule_type", "VARCHAR DEFAULT 'manual'"),
            ("achievements", "rule_value", "INTEGER DEFAULT 0"),
            ("achievements", "rule_target", "VARCHAR"),
            ("achievements", "rule_meta", "VARCHAR"),
            ("achievements", "target_image", "VARCHAR"),
            ("achievements", "reward_xp", "INTEGER DEFAULT 0"),
            ("users", "current_streak", "INTEGER DEFAULT 0"),
            ("users", "last_streak_date", "VARCHAR"),
            ("users", "is_verified", "BOOLEAN DEFAULT 0"),
            ("users", "yandex_token", "VARCHAR"),
            ("users", "lastfm_username", "VARCHAR"),
            ("users", "is_private", "BOOLEAN DEFAULT 0"),
            ("users", "hidden_artists", "VARCHAR DEFAULT ''"),
            ("users", "last_sync", "DATETIME"),
            ("user_achievements", "is_displayed", "BOOLEAN DEFAULT 1"),
            ("user_achievements", "notified", "BOOLEAN DEFAULT 0"),
            ("scrobbles", "listened_sec", "INTEGER DEFAULT 0"),
            ("scrobbles", "is_playing", "BOOLEAN DEFAULT 1"),
            ("scrobbles", "updated_at", "DATETIME"),
            ("scrobbles", "xp_earned", "INTEGER DEFAULT 1"),
            ("scrobbles", "is_imported", "BOOLEAN DEFAULT 0"),
            ("tracks", "album", "VARCHAR"),
            ("tracks", "genre", "VARCHAR"),
        ]
        
        for table, col, col_type in migrations:
            add_column_if_missing(table, col, col_type)

init_db()

IMPORTING_USERS = set() # In-memory lock for Last.fm imports

def sanitize_text(text_val: Optional[str]) -> Optional[str]:
    if not text_val: return text_val
    # More robust sanitization: remove common XSS patterns and strip HTML
    text_val = re.sub(r'<[^>]*>', '', text_val)
    # Escape quotes and dangerous chars if used in JS/HTML attributes
    return text_val.replace('"', '&quot;').replace("'", '&#39;').replace('<', '&lt;').replace('>', '&gt;')

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

async def refresh_spotify_token(user: User, db: Session):
    if not user.spotify_refresh_token: return None
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post("https://accounts.spotify.com/api/token", data={
                "grant_type": "refresh_token",
                "refresh_token": user.spotify_refresh_token,
                "client_id": SPOTIFY_CLIENT_ID,
                "client_secret": SPOTIFY_CLIENT_SECRET
            }, headers={"Content-Type": "application/x-www-form-urlencoded"})
            if resp.status_code == 200:
                data = resp.json()
                user.spotify_access_token = data["access_token"]
                db.commit()
                return data["access_token"]
        except Exception as e:
            print(f"Token refresh error: {e}")
    return None

async def poll_external_services():
    """
    Основной цикл облачного скробблинга.
    Опрашивает внешние API для пользователей параллельно.
    """
    while True:
        db = SessionLocal()
        try:
            # Берем всех пользователей, у которых привязан Spotify или Яндекс
            users = db.query(User).filter((User.spotify_refresh_token != None) | (User.yandex_token != None)).all()
            
            async def poll_user(user_id):
                local_db = SessionLocal()
                try:
                    u = local_db.query(User).filter(User.id == user_id).first()
                    if not u: return
                    
                    # Список активных коннекторов
                    connectors = []
                    
                    if u.spotify_refresh_token:
                        connectors.append(sync_spotify_status(u, local_db))
                    
                    if u.yandex_token:
                        connectors.append(sync_yandex_status(u, local_db))
                    
                    # Плейсхолдеры для будущих интеграций
                    # if u.apple_music_token: connectors.append(sync_apple_music_status(u, local_db))
                    # if u.zvuk_token: connectors.append(sync_zvuk_status(u, local_db))
                    
                    if connectors:
                        await asyncio.gather(*connectors)
                    
                    # Обновляем время последней синхронизации
                    u.last_sync = datetime.now(timezone.utc).replace(tzinfo=None)
                    local_db.commit()
                except Exception as e:
                    print(f"Error polling user {user_id}: {e}")
                finally:
                    local_db.close()

            # Запускаем задачи параллельно
            if users:
                tasks = [poll_user(u.id) for u in users]
                await asyncio.gather(*tasks)
                
        except Exception as e:
            print(f"Cloud Worker Global Error: {e}")
        finally:
            db.close()
        await asyncio.sleep(15) # Интервал опроса (уменьшен для отзывчивости)

async def sync_spotify_status(user: User, db: Session):
    token = user.spotify_access_token
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {token}"}
        try:
            resp = await client.get("https://api.spotify.com/v1/me/player/currently-playing", headers=headers)
            
            if resp.status_code == 401: # Token expired
                token = await refresh_spotify_token(user, db)
                if token:
                    headers = {"Authorization": f"Bearer {token}"}
                    resp = await client.get("https://api.spotify.com/v1/me/player/currently-playing", headers=headers)
            
            if resp.status_code == 200:
                data = resp.json()
                if data and data.get("is_playing"):
                    item = data.get("item")
                    if not item: return
                    title = item.get("name")
                    artist = ", ".join([a["name"] for a in item.get("artists", [])])
                    cover = item.get("album", {}).get("images", [{}])[0].get("url")
                    track_url = item.get("external_urls", {}).get("spotify")
                    duration = int(item.get("duration_ms", 0) / 1000)
                    progress = int(data.get("progress_ms", 0) / 1000)
                    album = item.get("album", {}).get("name")
                    
                    await process_scrobble(db, user, title, artist, cover, track_url, "spotify", progress, True, duration, album)
        except Exception as e:
            print(f"Spotify sync error: {e}")

async def sync_yandex_status(user: User, db: Session):
    async with httpx.AsyncClient() as client:
        try:
            # Используем мобильный эндпоинт статуса с расширенными заголовками
            headers = {
                "Authorization": f"OAuth {user.yandex_token}",
                "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
                "User-Agent": "Yandex-Music-API"
            }
            resp = await client.get("https://api.music.yandex.net/external-api/status", headers=headers, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("result") and data["result"].get("nowPlaying"):
                    np = data["result"]["nowPlaying"]
                    track_data = np.get("track")
                    if not track_data: return
                    
                    title = track_data.get("title")
                    artist = ", ".join([a["name"] for a in track_data.get("artists", [])])
                    # Формируем URL обложки
                    cover_uri = track_data.get("coverUri")
                    cover = "https://" + cover_uri.replace("%%", "400x400") if cover_uri else None
                    track_id = track_data.get("id")
                    track_url = f"https://music.yandex.ru/track/{track_id}"
                    duration = int(track_data.get("durationMs", 0) / 1000)
                    progress = int(np.get("progressMs", 0) / 1000)
                    album = track_data.get("albums", [{}])[0].get("title") if track_data.get("albums") else None
                    
                    await process_scrobble(db, user, title, artist, cover, track_url, "yandex", progress, True, duration, album)
        except Exception as e:
            print(f"Yandex sync error: {e}")
def get_admin_user(api_key: str, db: Session) -> User:
    user = db.query(User).filter(User.api_key == api_key).first()
    if not user or user.username not in DEVELOPERS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    return user

# Simple In-Memory TTL Cache
CACHE: Dict[str, Dict] = {}
def get_from_cache(key: str, ttl: int = 300):
    if key in CACHE:
        entry = CACHE[key]
        if time.time() - entry['ts'] < ttl:
            return entry['data']
    return None

def set_to_cache(key: str, data: any):
    CACHE[key] = {'data': data, 'ts': time.time()}

app = FastAPI(title="VEIN Music API")

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        if username not in self.active_connections:
            self.active_connections[username] = []
        self.active_connections[username].append(websocket)

    def disconnect(self, websocket: WebSocket, username: str):
        if username in self.active_connections:
            self.active_connections[username].remove(websocket)
            if not self.active_connections[username]:
                del self.active_connections[username]

    async def broadcast_to_user(self, username: str, message: dict):
        if username in self.active_connections:
            for connection in self.active_connections[username]:
                try: await connection.send_json(message)
                except: pass

manager = ConnectionManager()

# Global Rate Limiter
RATE_LIMITS = {} # {ip: {timestamp: count}}
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host
    now = time.time()
    # Global cleanup if dictionary gets too large
    if len(RATE_LIMITS) > 10000:
        # Remove IPs that haven't sent requests in the last minute
        expired_ips = [i for i, times in RATE_LIMITS.items() if not times or now - times[-1] > 60]
        for i in expired_ips: del RATE_LIMITS[i]
        
    if ip not in RATE_LIMITS: RATE_LIMITS[ip] = []
    RATE_LIMITS[ip] = [t for t in RATE_LIMITS[ip] if now - t < 60] # 1 min window
    if len(RATE_LIMITS[ip]) > 1000: # 1000 req/min (увеличено для стабильности)
         from fastapi.responses import JSONResponse
         return JSONResponse(status_code=429, content={"error": "Too many requests. Please wait a minute."})
    RATE_LIMITS[ip].append(now)
    return await call_next(request)

@app.get("/api/error/rate-limited")
def rate_limited(): return JSONResponse(status_code=429, content={"error": "Too many requests. Please wait a minute."})

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str, db: Session = Depends(get_db)):
    # Check if user is private
    user = db.query(User).filter(User.username == username).first()
    if user and user.is_private:
        # Check for token in query params
        token = websocket.query_params.get("token")
        if not token or token != user.api_key:
            await websocket.close(code=4003) # Forbidden
            return

    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "SYNC_REQUEST":
                # User wants to sync with another user
                target = data.get("target")
                await manager.broadcast_to_user(target, {
                    "type": "SYNC_INVITE",
                    "from": username
                })
    except WebSocketDisconnect:
        manager.disconnect(websocket, username)

class UserCreate(BaseModel): username: str; password: str
class ScrobbleData(BaseModel): 
    api_key: str; title: str; artist: str
    cover_url: Optional[str] = None; track_url: Optional[str] = None; album: Optional[str] = None
    source: str; progress_sec: Optional[int] = 0; is_playing: Optional[bool] = True
    duration: Optional[int] = 0

class ProfileUpdate(BaseModel):
    api_key: str; display_name: Optional[str] = None; bio: Optional[str] = None; avatar_url: Optional[str] = None; cover_url: Optional[str] = None
    location: Optional[str] = None; favorite_genre: Optional[str] = None; equipment: Optional[str] = None; social_links: Optional[str] = None; theme: Optional[str] = None
    favorite_artist: Optional[str] = None; favorite_artist_url: Optional[str] = None
    favorite_track: Optional[str] = None; favorite_track_url: Optional[str] = None
    favorite_album: Optional[str] = None; favorite_album_url: Optional[str] = None
    is_private: Optional[bool] = False; hidden_artists: Optional[str] = ""; lastfm_username: Optional[str] = None

class LevelUpdate(BaseModel): api_key: str; new_level: int
class AchCreate(BaseModel): api_key: str; name: str; description: str; icon: str; rule_type: str = "manual"; rule_value: int = 0; rule_target: Optional[str] = None; rule_meta: Optional[str] = None; target_image: Optional[str] = None; reward_xp: int = 0
class AchUpdate(BaseModel): api_key: str; name: str; description: str; icon: str; rule_type: str = "manual"; rule_value: int = 0; rule_target: Optional[str] = None; rule_meta: Optional[str] = None; target_image: Optional[str] = None; reward_xp: int = 0
class AchAssign(BaseModel): api_key: str; achievement_id: int
class ToggleAch(BaseModel): api_key: str; achievement_id: int
class FollowAction(BaseModel): api_key: str
class VerifyUserRequest(BaseModel): api_key: str; is_verified: bool
class MarkRead(BaseModel): ua_ids: List[int]
class LikeRequest(BaseModel): api_key: str
class ApiKeyRequest(BaseModel): api_key: str
class AdminUserUpdate(BaseModel): api_key: str; display_name: Optional[str] = None; bio: Optional[str] = None; avatar_url: Optional[str] = None

os.makedirs("uploads", exist_ok=True)

allowed_origins = [
    FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://music.vein.guru"
]

app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup_event():
    init_db()
    # Запуск облачного скробблинга в фоне
    asyncio.create_task(poll_external_services())


@app.get("/uploads/{filename}")
async def get_upload(filename: str, request: Request, db: Session = Depends(get_db)):
    # Проверяем Referer, чтобы разрешить загрузку внутри приложения
    referer = request.headers.get("referer")
    allowed_hosts = [FRONTEND_URL.replace("http://", "").replace("https://", ""), "127.0.0.1:3000", "localhost:3000", "music.vein.guru"]
    
    if referer:
        for host in allowed_hosts:
            if host in referer:
                return FileResponse(os.path.join("uploads", filename))
    
    # Также разрешаем доступ по API-ключам для отладки или внешних ссылок
    api_key = request.query_params.get("api_key")
    if api_key:
        user = db.query(User).filter(User.api_key == api_key).first()
        if user:
            return FileResponse(os.path.join("uploads", filename))
            
    raise HTTPException(status_code=403, detail="Доступ запрещен. Изображение доступно только через приложение.")

def get_password_hash(password: str) -> str: return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
def verify_password(plain_password: str, hashed_password: str) -> bool: return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

async def parse_og_meta(url: str):
    if not url: return None, None
    if not url.startswith("http"): url = "https://" + url
    
    # SSRF Protection: Block local/internal addresses
    parsed_url = urllib.parse.urlparse(url)
    hostname = parsed_url.hostname.lower() if parsed_url.hostname else ""
    if any(x in hostname for x in ["localhost", "127.0.0.1", "0.0.0.0", "::1"]):
        return None, None
    # Block private IP ranges (basic check)
    if re.match(r'^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.)', hostname):
        return None, None

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    title, img = None, None
    async with httpx.AsyncClient(headers=headers, timeout=5.0, follow_redirects=True) as client:
        if "music.yandex.ru" in url:
            try:
                # SSRF Check for each potential sub-request
                if any(x in url for x in ["localhost", "127.0.0.1", "0.0.0.0"]):
                    return None, None
                if "/artist/" in url:
                    artist_id = url.split('/artist/')[1].split('/')[0].split('?')[0]
                    res = (await client.get(f"https://music.yandex.ru/handlers/artist.jsx?artist={artist_id}")).json()
                    title, img = res.get("artist", {}).get("name"), "https://" + res.get("artist", {}).get("cover", {}).get("uri", "").replace("%%", "400x400") if res.get("artist", {}).get("cover", {}).get("uri") else None
                elif "/album/" in url and "/track/" not in url:
                    album_id = url.split('/album/')[1].split('/')[0].split('?')[0]
                    res = (await client.get(f"https://music.yandex.ru/handlers/album.jsx?album={album_id}")).json()
                    title, img = res.get("title"), "https://" + res.get("coverUri", "").replace("%%", "400x400") if res.get("coverUri") else None
                elif "/track/" in url:
                    track_id = url.split('/track/')[1].split('/')[0].split('?')[0]
                    res = (await client.get(f"https://music.yandex.ru/handlers/track.jsx?track={track_id}")).json()
                    t_data = res.get("track", {})
                    title = f"{t_data.get('artists', [{}])[0].get('name')} — {t_data.get('title')}" if t_data.get('artists') else t_data.get('title')
                    img = "https://" + (t_data.get("coverUri") or res.get("coverUri", "")).replace("%%", "400x400") if (t_data.get("coverUri") or res.get("coverUri")) else None
            except Exception as e:
                print(f"Yandex OG parsing error: {e}")
        
        if not title or not img:
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    t_m = re.search(r'<meta\s+(?:property|name)=["\']og:title["\']\s+content=["\']([^"\']+)["\']', resp.text, re.IGNORECASE)
                    i_m = re.search(r'<meta\s+(?:property|name)=["\']og:image["\']\s+content=["\']([^"\']+)["\']', resp.text, re.IGNORECASE)
                    if not title and t_m: title = t_m.group(1).split(' | ')[0]
                    if not img and i_m: img = i_m.group(1).replace('200x200', '400x400').replace('%%', '400x400')
                    
                    if not title:
                        t_tag = re.search(r'<title>(.*?)</title>', resp.text, re.IGNORECASE | re.DOTALL)
                        if t_tag: title = t_tag.group(1).strip()
            except Exception as e:
                print(f"Generic OG parsing error: {e}")
    return title, img

async def get_track_duration(url: str) -> int:
    if not url or not url.startswith("http"): return 180 
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
            if "music.yandex.ru" in url and "/track/" in url:
                track_id = url.split('/track/')[1].split('/')[0].split('?')[0]
                res = (await client.get(f"https://music.yandex.ru/handlers/track.jsx?track={track_id}")).json()
                return int(res.get("track", {}).get("durationMs", 180000) / 1000)
    except Exception as e:
        print(f"Duration fetch error: {e}")
    return 180

async def get_album_track_count(url: str) -> int:
    if not url or not url.startswith("http"): return 0
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
            if "music.yandex.ru" in url and "/album/" in url:
                album_id = url.split('/album/')[1].split('/')[0].split('?')[0]
                res = (await client.get(f"https://music.yandex.ru/handlers/album.jsx?album={album_id}")).json()
                return res.get("trackCount", 0)
            elif "spotify.com" in url and "/album/" in url:
                resp = await client.get(url)
                match = re.search(r'music:song_count["\']\s+content=["\'](\d+)["\']', resp.text, re.IGNORECASE)
                if match: return int(match.group(1))
    except Exception as e:
        print(f"Album track count error: {e}")
    return 0

async def get_track_genre(url: str, artist: str = None) -> str:
    if not url or not url.startswith("http"): return None
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
            if "music.yandex.ru" in url:
                if "/track/" in url:
                    track_id = url.split('/track/')[1].split('/')[0].split('?')[0]
                    res = (await client.get(f"https://music.yandex.ru/handlers/track.jsx?track={track_id}")).json()
                    albums = res.get("track", {}).get("albums", [])
                    if albums: return albums[0].get("genre")
                elif "/album/" in url:
                    album_id = url.split('/album/')[1].split('/')[0].split('?')[0]
                    res = (await client.get(f"https://music.yandex.ru/handlers/album.jsx?album={album_id}")).json()
                    return res.get("genre")
    except Exception as e:
        print(f"Genre fetch error: {e}")
    return None

def get_active_streak(user: User):
    if not user.last_streak_date: return 0
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    yesterday_str = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    if user.last_streak_date in [today_str, yesterday_str]:
        return user.current_streak or 0
    return 0

def check_auto_achievements(user, db: Session):
    auto_achs = db.query(Achievement).filter(Achievement.rule_type != "manual").all()
    if not auto_achs: return

    user_ach_ids = {ua.achievement_id for ua in db.query(UserAchievement).filter_by(user_id=user.id).all()}

    for ach in auto_achs:
        if ach.id in user_ach_ids: continue 
        granted = False
        
        if ach.rule_type == "total_scrobbles":
            if db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).count() >= ach.rule_value: granted = True
        elif ach.rule_type == "night_scrobbles":
            valid_times = db.query(Scrobble.played_at).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).all()
            night_count = sum(1 for (dt,) in valid_times if dt.replace(tzinfo=timezone.utc).astimezone().strftime('%H') in ['00', '01', '02', '03', '04', '05'])
            if night_count >= ach.rule_value: granted = True
        elif ach.rule_type == "specific_track" and ach.rule_target:
            if ach.rule_target.startswith("http"):
                if hasattr(ach, 'rule_meta') and ach.rule_meta:
                    parts = re.split(r'\s*[-—]\s*', ach.rule_meta)
                    if len(parts) >= 2: count = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, (Track.artist.ilike(f"%{parts[0].strip()}%") & Track.title.ilike(f"%{parts[-1].strip()}%")) | (Track.title.ilike(f"%{parts[0].strip()}%") & Track.title.ilike(f"%{parts[-1].strip()}%"))).count()
                    else: count = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, (Track.title.ilike(f"%{ach.rule_meta}%")) | (Track.artist.ilike(f"%{ach.rule_meta}%"))).count()
                else:
                    target_str = ach.rule_target.split('?')[0]
                    if "yandex.ru" in target_str and "/track/" in target_str:
                        track_id = target_str.split("/track/")[1].strip("/")
                        count = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.track_url.like(f"%/track/{track_id}%")).count()
                    else: count = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.track_url.like(f"%{target_str}%")).count()
            else:
                parts = re.split(r'\s*[-—]\s*', ach.rule_target)
                if len(parts) >= 2: count = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, (Track.artist.ilike(f"%{parts[0].strip()}%") & Track.title.ilike(f"%{parts[-1].strip()}%")) | (Track.title.ilike(f"%{parts[0].strip()}%") & Track.title.ilike(f"%{parts[-1].strip()}%"))).count()
                else: count = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, (Track.title.ilike(f"%{ach.rule_target}%")) | (Track.artist.ilike(f'%{ach.rule_target.split("||")[0] if "||" in ach.rule_target else ach.rule_target}%'))).count()
            if count >= ach.rule_value: granted = True
            
        elif ach.rule_type == "specific_album" and ach.rule_target:
            if ach.target_image and ("avatars.yandex.net" in ach.target_image or "scdn.co" in ach.target_image):
                count = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.cover_url == ach.target_image).scalar() or 0
            else:
                clean_target = ach.rule_target.split('?')[0]
                count = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.track_url.like(f"%{clean_target}%")).scalar() or 0
            if count >= ach.rule_value: granted = True
            
        elif ach.rule_type == "specific_artist" and ach.rule_target:
            count = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.artist.ilike(f'%{ach.rule_target.split("||")[0] if "||" in ach.rule_target else ach.rule_target}%')).count()
            if count >= ach.rule_value: granted = True

        if granted:
            db.add(UserAchievement(user_id=user.id, achievement_id=ach.id))
            user.bonus_xp = (user.bonus_xp or 0) + (ach.reward_xp or 0)
            db.commit()

def get_user_level_info(user: User, db: Session):
    streak = get_active_streak(user)
    scrobbles_xp = db.query(func.sum(Scrobble.xp_earned)).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).scalar() or 0
    base_xp = scrobbles_xp + (user.bonus_xp or 0)
    total_xp = int(base_xp * 1.1) if streak >= 7 else base_xp
    level = (total_xp // 100) + 1
    
    if level >= 100: rank = "Божество"
    elif level >= 50: rank = "Легенда"
    elif level >= 30: rank = "Маньяк"
    elif level >= 15: rank = "Аудиофил"
    elif level >= 5: rank = "Меломан"
    else: rank = "Турист"
    
    return level, rank, total_xp, user.theme

def format_history_item(scrobble, track, db: Session = None, counters: dict = None):
    upd_time = scrobble.updated_at or scrobble.played_at
    # Normalize to UTC for comparison
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    is_playing = scrobble.is_playing and (now - upd_time).total_seconds() < 15
    
    # Calculate relative time
    diff = now - scrobble.played_at
    if diff.total_seconds() < 60:
        rel_time = "только что"
    elif diff.total_seconds() < 3600:
        rel_time = f"{int(diff.total_seconds() // 60)}м назад"
    elif diff.total_seconds() < 86400:
        rel_time = f"{int(diff.total_seconds() // 3600)}ч назад"
    else:
        rel_time = scrobble.played_at.strftime("%d %b")

    data = {
        "id": scrobble.id,
        "artist": track.artist, "title": track.title, "cover_url": track.cover_url,
        "track_url": track.track_url, "source": scrobble.source, "time": scrobble.played_at,
        "relative_time": rel_time,
        "duration": track.duration, "listened_sec": scrobble.listened_sec,
        "is_playing": is_playing, "updated_at": upd_time
    }
    if counters:
        data["likes_count"] = counters.get(scrobble.id, {}).get("likes", 0)
        data["comments_count"] = counters.get(scrobble.id, {}).get("comments", 0)
    elif db:
        data["likes_count"] = db.query(ScrobbleLike).filter_by(scrobble_id=scrobble.id).count()
        data["comments_count"] = db.query(ScrobbleComment).filter_by(scrobble_id=scrobble.id).count()
    return data

async def process_scrobble(db: Session, user: User, title: str, artist: str, cover_url: str, track_url: str, source: str, progress_sec: int, is_playing: bool, duration: int, album: str = None):
    # Removed synchronous file logging containing blocking IO
        
    track = db.query(Track).filter(Track.title == title, Track.artist == artist).first()
    if not track:
        track = Track(title=title, artist=artist, cover_url=cover_url, track_url=track_url, duration=duration or 0, album=album)
        db.add(track)
        db.commit()
        db.refresh(track)
    else:
        updated = False
        if cover_url and not track.cover_url: 
            track.cover_url = cover_url
            updated = True
        if track_url and "/track/" in track_url:
            if not track.track_url or "/track/" not in track.track_url:
                track.track_url = track_url
                updated = True
        
        if album and not track.album:
            track.album = album
            updated = True
                
        if duration and duration > 0:
            if track.duration == 0 or track.duration == 180 or abs(track.duration - duration) > 5:
                track.duration = duration
                updated = True

        if updated: 
            db.commit()

    if track.duration == 0 and track.track_url:
        track.duration = await get_track_duration(track.track_url)
        db.commit()

    if not track.genre and track.track_url:
        track.genre = await get_track_genre(track.track_url)
        db.commit()
        
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    last_scrobble = db.query(Scrobble).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).first()
    
    is_new = False
    if not last_scrobble or last_scrobble.track_id != track.id:
        if last_scrobble and last_scrobble.is_playing and (now - last_scrobble.updated_at).total_seconds() < 1.0:
            return "ignored_spam_protection"
        is_new = True
    elif progress_sec < 5 and (last_scrobble.listened_sec or 0) > 30: 
        is_new = True
            
    if is_new:
        new_s = Scrobble(user_id=user.id, track_id=track.id, source=source, played_at=now, listened_sec=0, is_playing=is_playing, updated_at=now)
        db.add(new_s)
        db.commit()
        # Мгновенно уведомляем фронтенд о начале нового трека
        await manager.broadcast_to_user(user.username, {
            "type": "NEW_SCROBBLE",
            "track": format_history_item(new_s, track)
        })
    else:
        time_elapsed = (now - last_scrobble.updated_at).total_seconds()
        old_listened = last_scrobble.listened_sec or 0
        
        if last_scrobble.is_playing and is_playing and 0 < time_elapsed < 35:
            last_scrobble.listened_sec = old_listened + int(round(time_elapsed))
            
        last_scrobble.is_playing = is_playing
        last_scrobble.updated_at = now
        db.commit()
        
        threshold = (track.duration if track.duration > 0 else 180) * 0.85
        if last_scrobble.listened_sec >= threshold and old_listened < threshold:
            is_fav = False
            fav_art = user.favorite_artist.lower() if user.favorite_artist else ""
            fav_trk = user.favorite_track.lower() if user.favorite_track else ""
            fav_alb = user.favorite_album.lower() if user.favorite_album else ""
            
            t_artist = track.artist.lower()
            t_title = track.title.lower()
            t_album = track.album.lower() if track.album else ""
            
            if fav_art and fav_art in t_artist: is_fav = True
            if fav_trk and (fav_trk in t_title or fav_trk in f"{t_artist} {t_title}"): is_fav = True
            if fav_alb and t_album and fav_alb in t_album: is_fav = True
            
            last_scrobble.xp_earned = 2 if is_fav else 1
            db.commit()
            
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
            scrobbles_today = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.played_at >= today_start, Scrobble.listened_sec * 100 >= Track.duration * 85).count()
            if scrobbles_today >= 5:
                today_str = today_start.strftime("%Y-%m-%d")
                yesterday_str = (today_start - timedelta(days=1)).strftime("%Y-%m-%d")
                if user.last_streak_date != today_str:
                    if user.last_streak_date == yesterday_str: user.current_streak = (user.current_streak or 0) + 1
                    else: user.current_streak = 1
                    user.last_streak_date = today_str
                    db.commit()
            
            # Removed check_auto_achievements from hot path for performance
            
            # Broadcast update via WebSockets
            # Redundant broadcast removed here (handled by the block at the start of new scrobbles)
            # but we keep it for threshold updates specifically if needed.
            # Actually, let's keep only one broadcast per major state change.
            pass
            
    return "ok"

async def import_lastfm_history(user_id: int, db_session_factory):
    db = db_session_factory()
    imported_count = 0
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"Import Error: User {user_id} not found")
            return
        if not user.lastfm_username:
            print(f"Import Error: Last.fm username not set for user {user.username}")
            return
        if not LASTFM_API_KEY:
            print(f"Import Error: LASTFM_API_KEY is missing in .env")
            return
        
        async with httpx.AsyncClient() as client:
            page = 1
            total_pages = 1
            while page <= total_pages and page <= 5: # Limit to 5 pages (1000 tracks) for now
                params = {
                    "method": "user.getrecenttracks",
                    "user": user.lastfm_username,
                    "api_key": LASTFM_API_KEY,
                    "format": "json",
                    "limit": 200,
                    "page": page
                }
                resp = await client.get(LASTFM_BASE_URL, params=params)
                if resp.status_code != 200:
                    print(f"Last.fm API Error: {resp.status_code} - {resp.text}")
                    break
                res = resp.json()
                if "error" in res:
                    print(f"Last.fm API Logic Error: {res.get('message')}")
                    break
                tracks = res.get("recenttracks", {}).get("track", [])
                total_pages = int(res.get("recenttracks", {}).get("@attr", {}).get("totalPages", 1))
                print(f"Importing page {page}/{total_pages} for user {user.username}, found {len(tracks)} tracks")
                
                for t in tracks:
                    if t.get("@attr", {}).get("nowplaying") == "true": continue
                    
                    title = t.get("name")
                    artist = t.get("artist", {}).get("#text")
                    album = t.get("album", {}).get("#text")
                    cover = t.get("image", [{}, {}, {}, {"#text": ""}])[3].get("#text")
                    uts = int(t.get("date", {}).get("uts", 0))
                    dt = datetime.fromtimestamp(uts, tz=timezone.utc).replace(tzinfo=None)
                    
                    # Check if already exists
                    existing = db.query(Scrobble).filter(Scrobble.user_id == user.id, Scrobble.played_at == dt).first()
                    if existing: continue
                    
                    track = db.query(Track).filter(Track.title == title, Track.artist == artist).first()
                    if not track:
                        track = Track(title=title, artist=artist, cover_url=cover, album=album, duration=180)
                        db.add(track)
                        db.commit()
                        db.refresh(track)
                    
                    # Try to get duration if track exists, else 180s
                    duration = track.duration or 180
                    
                    scrobble = Scrobble(user_id=user.id, track_id=track.id, source="lastfm", played_at=dt, listened_sec=duration, is_playing=False, updated_at=dt, xp_earned=1, is_imported=True)
                    db.add(scrobble)
                    imported_count += 1
                
                db.commit()
                page += 1
        
        print(f"Import Finished: Imported {imported_count} scrobbles for user {user.username}")
        # Notify user via WebSocket if connected
        await manager.send_personal_message(f"✅ Импорт завершен! Добавлено {imported_count} треков.", user.username)
        
    except Exception as e:
        print(f"Last.fm Import Logic Error: {e}")
    finally:
        IMPORTING_USERS.discard(user_id)
        db.close()

@app.post("/api/import/lastfm")
async def start_lastfm_import(data: LikeRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.api_key).first()
    if not user: raise HTTPException(401)
    if user.id in IMPORTING_USERS: raise HTTPException(429, "Импорт уже запущен")
    if not user.lastfm_username: raise HTTPException(400, "Last.fm username not set in profile")
    if not LASTFM_API_KEY: raise HTTPException(500, "Last.fm API key not configured on server")
    
    IMPORTING_USERS.add(user.id)
    background_tasks.add_task(import_lastfm_history, user.id, SessionLocal)
    return {"status": "import_started"}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    # Security: Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Только изображения (JPG, PNG, WEBP, GIF)")

    # Security: Validate file size (max 5MB)
    MAX_SIZE = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "Файл слишком большой (макс. 5МБ)")
    
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    # Sanitize extension
    if ext.lower() not in ["jpg", "jpeg", "png", "webp", "gif"]:
        ext = "jpg"
        
    filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join("uploads", filename)
    with open(file_path, "wb") as buffer:
        buffer.write(content)
    return {"url": f"{API_BASE_URL}/uploads/{filename}"}

@app.post("/auth/register")
def register(data: UserCreate, db: Session = Depends(get_db)):
    if len(data.username) < 3: raise HTTPException(400, "Никнейм слишком короткий")
    if len(data.password) < 6: raise HTTPException(400, "Пароль должен быть не менее 6 символов")
    if db.query(User).filter(User.username == data.username).first(): raise HTTPException(400, "Никнейм занят")
    new_user = User(username=data.username, hashed_password=get_password_hash(data.password), api_key=secrets.token_hex(16))
    db.add(new_user); db.commit(); db.refresh(new_user)
    return {"message": "Успешная регистрация", "username": new_user.username, "api_key": new_user.api_key}

@app.post("/auth/login")
def login(data: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password): raise HTTPException(400, "Неверный логин/пароль")
    return {"username": user.username, "api_key": user.api_key}

@app.get("/auth/spotify/login")
def spotify_login(api_key: str):
    scopes = "user-read-currently-playing user-read-playback-state"
    return RedirectResponse(f"https://accounts.spotify.com/authorize?client_id={SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri={SPOTIFY_REDIRECT_URI}&scope={scopes}&state={api_key}")

@app.get("/auth/spotify/callback")
async def spotify_callback(code: str, state: str, db: Session = Depends(get_db)):
    # state contains the api_key
    user = db.query(User).filter(User.api_key == state).first()
    if not user: raise HTTPException(401)
    
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://accounts.spotify.com/api/token", data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": SPOTIFY_REDIRECT_URI,
            "client_id": SPOTIFY_CLIENT_ID,
            "client_secret": SPOTIFY_CLIENT_SECRET
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        
        if resp.status_code == 200:
            data = resp.json()
            user.spotify_access_token = data["access_token"]
            user.spotify_refresh_token = data["refresh_token"]
            db.commit()
            return RedirectResponse(f"{FRONTEND_URL}/settings?spotify=success")
    return RedirectResponse(f"{FRONTEND_URL}/settings?spotify=error")

@app.post("/api/integrations/yandex")
def update_yandex_token(data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.get("api_key")).first()
    if not user: raise HTTPException(401)
    user.yandex_token = data.get("token")
    db.commit()
    return {"status": "ok"}

@app.post("/api/integrations/spotify/disconnect")
def disconnect_spotify(data: LikeRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.api_key).first()
    if not user: raise HTTPException(401)
    user.spotify_access_token = None
    user.spotify_refresh_token = None
    db.commit()
    return {"status": "ok"}

@app.post("/api/integrations/yandex/disconnect")
def disconnect_yandex(data: LikeRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.api_key).first()
    if not user: raise HTTPException(401)
    user.yandex_token = None
    db.commit()
    return {"status": "ok"}

@app.post("/api/integrations/lastfm/disconnect")
def disconnect_lastfm(data: LikeRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.api_key).first()
    if not user: raise HTTPException(401)
    user.lastfm_username = None
    db.commit()
    return {"status": "ok"}

@app.post("/api/scrobble")
async def add_scrobble(data: ScrobbleData, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.api_key == data.api_key).first()
        if not user: raise HTTPException(401)
        
        # Anti-Cheat: Max 40 scrobbles per hour (normal music is ~15-20)
        hour_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
        scrobbles_h = db.query(Scrobble).filter(Scrobble.user_id == user.id, Scrobble.played_at >= hour_ago).count()
        if scrobbles_h > 40:
             return {"status": "flagged", "message": "Слишком много прослушиваний за час (Anti-Cheat)"}

        # Anti-Spam: Max 1 new scrobble per 10 seconds
        last_s = db.query(Scrobble).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).first()
        if last_s and (datetime.now(timezone.utc).replace(tzinfo=None) - last_s.played_at).total_seconds() < 10:
            # Allow updates to the current playing track, but block new tracks
            track = db.query(Track).filter(Track.title == data.title, Track.artist == data.artist).first()
            if not track or last_s.track_id != track.id:
                return {"status": "rate_limited", "message": "Слишком частые скробблы"}

        res = await process_scrobble(db, user, data.title, data.artist, data.cover_url, data.track_url, data.source, data.progress_sec, data.is_playing, data.duration, data.album)
        return {"status": res}
    except Exception as e:
        raise e
@app.get("/api/user/{username}")
def get_user_info(username: str, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404, "Юзер не найден")
    check_auto_achievements(user, db)
    role = "developer" if user.username in DEVELOPERS else "tester" if user.username in TESTERS else "user"

    # Privacy check for profile data
    api_key = request.query_params.get("api_key")
    is_owner = api_key and user.api_key == api_key
    
    if user.is_private and not is_owner:
        return {
            "username": user.username, "display_name": user.display_name or user.username,
            "avatar_url": user.avatar_url, "is_private": True, "role": role
        }

    ach_data = db.query(Achievement, UserAchievement).join(UserAchievement, Achievement.id == UserAchievement.achievement_id).filter(UserAchievement.user_id == user.id).all()
    return {
        "username": user.username, "display_name": user.display_name or user.username, "bio": user.bio or "Этот пользователь пока ничего о себе не рассказал.",
        "avatar_url": user.avatar_url, "cover_url": user.cover_url, "location": user.location, "favorite_genre": user.favorite_genre, "equipment": user.equipment,
        "social_links": user.social_links or "[]", "theme": user.theme or "classic", "is_verified": user.is_verified,
        "favorite_artist": user.favorite_artist, "favorite_artist_url": user.favorite_artist_url, "favorite_artist_cover": user.favorite_artist_cover,
        "favorite_track": user.favorite_track, "favorite_track_url": user.favorite_track_url, "favorite_track_cover": user.favorite_track_cover, 
        "favorite_album": user.favorite_album, "favorite_album_url": user.favorite_album_url, "favorite_album_cover": user.favorite_album_cover,
        "spotify_linked": bool(user.spotify_refresh_token), "yandex_linked": bool(user.yandex_token),
        "lastfm_username": user.lastfm_username, "last_sync": user.last_sync, "role": role,
        "achievements": [{"id": a.id, "name": a.name, "description": a.description, "icon": a.icon, "target_image": a.target_image, "reward_xp": a.reward_xp, "is_displayed": ua.is_displayed, "earned_at": ua.earned_at} for a, ua in ach_data],
        "streak": get_active_streak(user)
    }

@app.get("/api/taste-match/{viewer}/{profile}")
def get_taste_match(viewer: str, profile: str, db: Session = Depends(get_db)):
    viewer_user = db.query(User).filter(User.username == viewer).first()
    profile_user = db.query(User).filter(User.username == profile).first()
    if not viewer_user or not profile_user or viewer == profile:
        return {"match": 0, "common_artists": []}
    
    # SQL-based artist intersection for performance
    sql = text("""
        SELECT DISTINCT t.artist 
        FROM scrobbles s 
        JOIN tracks t ON s.track_id = t.id 
        WHERE s.user_id = :u1 AND s.listened_sec * 100 >= t.duration * 85
        INTERSECT
        SELECT DISTINCT t.artist 
        FROM scrobbles s 
        JOIN tracks t ON s.track_id = t.id 
        WHERE s.user_id = :u2 AND s.listened_sec * 100 >= t.duration * 85
    """)
    
    common_rows = db.execute(sql, {"u1": viewer_user.id, "u2": profile_user.id}).fetchall()
    common_artists = []
    for row in common_rows:
        for a in row[0].split(','):
            common_artists.append(a.strip())
    
    common_artists = list(set(common_artists)) # Unique clean names
    
    # Count total unique artists for denominator
    sql_total = text("""
        SELECT COUNT(DISTINCT t.artist) 
        FROM scrobbles s 
        JOIN tracks t ON s.track_id = t.id 
        WHERE (s.user_id = :u1 OR s.user_id = :u2) AND s.listened_sec * 100 >= t.duration * 85
    """)
    total_unique = db.execute(sql_total, {"u1": viewer_user.id, "u2": profile_user.id}).scalar() or 1
    
    match_percent = int((len(common_artists) / total_unique) * 100)
    return {"match": min(match_percent, 100), "common_artists": common_artists[:5]}

@app.get("/api/discovery/taste-twins")
def get_taste_twins(username: str, db: Session = Depends(get_db)):
    me = db.query(User).filter(User.username == username).first()
    if not me: raise HTTPException(404)
    
    # Efficiently find users with common artists using SQL
    sql = text("""
        SELECT u.id, u.username, u.display_name, u.avatar_url, COUNT(DISTINCT t.artist) as common_count
        FROM users u
        JOIN scrobbles s ON u.id = s.user_id
        JOIN tracks t ON s.track_id = t.id
        WHERE u.id != :my_id 
          AND s.listened_sec * 100 >= t.duration * 85
          AND t.artist IN (
              SELECT DISTINCT t2.artist 
              FROM scrobbles s2 
              JOIN tracks t2 ON s2.track_id = t2.id 
              WHERE s2.user_id = :my_id AND s2.listened_sec * 100 >= t2.duration * 85
          )
        GROUP BY u.id
        HAVING common_count > 0
        ORDER BY common_count DESC
        LIMIT 10
    """)
    
    rows = db.execute(sql, {"my_id": me.id}).fetchall()
    if not rows: return []
    
    # Calculate approximate match % for the top candidates
    my_artist_count = db.query(func.count(func.distinct(Track.artist))).join(Scrobble).filter(Scrobble.user_id == me.id, Scrobble.listened_sec * 100 >= Track.duration * 85).scalar() or 1
    
    results = []
    for row in rows:
        uid, uname, dname, avatar, common = row
        # Match % = (common artists / max(my artists, their artists))
        # For simplicity and performance, we use my_artist_count as base
        match = int((common / my_artist_count) * 100)
        
        # Get a few common artist names for display
        common_sql = text("""
            SELECT DISTINCT t.artist FROM tracks t 
            JOIN scrobbles s ON t.id = s.track_id
            WHERE s.user_id = :u1 AND s.listened_sec * 100 >= t.duration * 85
            INTERSECT
            SELECT DISTINCT t.artist FROM tracks t 
            JOIN scrobbles s ON t.id = s.track_id
            WHERE s.user_id = :u2 AND s.listened_sec * 100 >= t.duration * 85
            LIMIT 3
        """)
        common_names = [r[0].split(',')[0].strip() for r in db.execute(common_sql, {"u1": me.id, "u2": uid}).fetchall()]
        
        results.append({
            "username": uname,
            "display_name": dname or uname,
            "avatar_url": avatar,
            "match": min(match, 100),
            "common_artists": common_names
        })
        
    return results[:5]

@app.get("/api/notifications/{username}")
def get_notifications(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: return []
    new_achs = db.query(Achievement, UserAchievement).join(UserAchievement).filter(UserAchievement.user_id == user.id, UserAchievement.notified == False).all()
    return [{"ua_id": ua.id, "name": a.name, "icon": a.icon, "reward_xp": a.reward_xp, "target_image": a.target_image} for a, ua in new_achs]

@app.post("/api/notifications/{username}/read")
def mark_notifications_read(username: str, data: MarkRead, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: return {"status": "error"}
    db.query(UserAchievement).filter(UserAchievement.id.in_(data.ua_ids), UserAchievement.user_id == user.id).update({"notified": True}, synchronize_session=False)
    db.commit()
    return {"status": "ok"}

@app.get("/api/achievements/all/{username}")
def get_all_achievements(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404, "User not found")
    
    check_auto_achievements(user, db)

    all_achs = db.query(Achievement).all()
    user_achs = {ua.achievement_id: ua for ua in db.query(UserAchievement).filter_by(user_id=user.id).all()}
    total_users = db.query(User).count()
    res = []

    for a in all_achs:
        earned_count = db.query(UserAchievement).filter_by(achievement_id=a.id).count()
        rarity = round((earned_count / total_users * 100), 1) if total_users > 0 else 0
        ua = user_achs.get(a.id)
        current_val = 0
        target_val = a.rule_value
        
        if not ua and a.rule_type != "manual":
            if a.rule_type == "total_scrobbles": current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).count()
            elif a.rule_type == "night_scrobbles": 
                valid_times = db.query(Scrobble.played_at).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).all()
                current_val = sum(1 for (dt,) in valid_times if dt.replace(tzinfo=timezone.utc).astimezone().strftime('%H') in ['00', '01', '02', '03', '04', '05'])
            elif a.rule_type == "specific_track" and a.rule_target:
                if a.rule_target.startswith("http"):
                    if hasattr(a, 'rule_meta') and a.rule_meta:
                        parts = re.split(r'\s*[-—]\s*', a.rule_meta)
                        if len(parts) < 2: parts = a.rule_meta.split()
                        
                        if len(parts) >= 2:
                            from sqlalchemy import and_, or_
                            word_filters = []
                            for w in parts:
                                if w.strip(): word_filters.append(or_(Track.title.ilike(f"%{w.strip()}%"), Track.artist.ilike(f"%{w.strip()}%")))
                            current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, and_(*word_filters)).count()
                        else: current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, (Track.title.ilike(f"%{a.rule_meta}%")) | (Track.artist.ilike(f"%{a.rule_meta}%"))).count()
                    else:
                        target_str = a.rule_target.split('?')[0]
                        if "yandex.ru" in target_str and "/track/" in target_str:
                            track_id = target_str.split("/track/")[1].strip("/")
                            current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.track_url.like(f"%/track/{track_id}%")).count()
                        else: current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.track_url.like(f"%/track/{target_str}%")).count()
                else:
                    parts = re.split(r'\s*[-—]\s*', a.rule_target)
                    if len(parts) >= 2: current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, (Track.artist.ilike(f"%{parts[0].strip()}%") & Track.title.ilike(f"%{parts[-1].strip()}%")) | (Track.title.ilike(f"%{parts[0].strip()}%") & Track.title.ilike(f"%{parts[-1].strip()}%"))).count()
                    else: current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, (Track.title.ilike(f"%{a.rule_target}%")) | (Track.artist.ilike(f'%{a.rule_target.split("||")[0] if "||" in a.rule_target else a.rule_target}%'))).count()
                    
            elif a.rule_type == "specific_album" and a.rule_target:
                current_val_img = 0
                if a.target_image:
                    current_val_img = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.cover_url == a.target_image).scalar() or 0
                
                current_val_text = 0
                album_name = a.rule_meta if a.rule_meta else a.rule_target
                if "||" in a.rule_target: album_name = a.rule_target.split("||")[0]
                
                if album_name and not album_name.startswith("http"):
                    parts = re.split(r'\s*[-—]\s*', album_name)
                    if len(parts) >= 2:
                        current_val_text = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.artist.ilike(f"%{parts[0].strip()}%"), Track.album.ilike(f"%{parts[-1].strip()}%")).scalar() or 0
                    else:
                        current_val_text = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.album.ilike(f"%{album_name.strip()}%")).scalar() or 0
                
                current_val = max(current_val_img, current_val_text)
                    
            elif a.rule_type == "specific_artist" and a.rule_target:
                current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.artist.ilike(f'%{a.rule_target.split("||")[0] if "||" in a.rule_target else a.rule_target}%')).count()
        if ua: current_val = target_val

        res.append({
            "id": a.id, "name": a.name, "description": a.description, "icon": a.icon, "target_image": a.target_image, "reward_xp": a.reward_xp,
            "is_earned": bool(ua), "earned_at": ua.earned_at if ua else None, "is_displayed": ua.is_displayed if ua else False,
            "rarity": rarity, "current_progress": current_val, "target_value": target_val, "rule_type": a.rule_type,
            "rule_target": a.rule_target,
            "rule_meta": a.rule_meta
        })
        
    earned = [x for x in res if x["is_earned"]]
    unearned = [x for x in res if not x["is_earned"]]
    earned.sort(key=lambda x: str(x["earned_at"]), reverse=True)
    res = earned + unearned

    return {"user": {"username": user.username, "display_name": user.display_name or user.username, "avatar_url": user.avatar_url}, "achievements": res, "earned_count": len(user_achs), "total_count": len(all_achs)}

@app.get("/api/recommendations")
def get_recommendations(username: str, db: Session = Depends(get_db)):
    cache_key = f"recs_{username}"
    cached = get_from_cache(cache_key, ttl=1800) # 30 min cache
    if cached: return cached

    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    twins = get_taste_twins(username, db)
    if not twins: return []
    twin_names = [t['username'] for t in twins]
    sql = text("""
        SELECT t.artist, t.cover_url, COUNT(s.id) as plays
        FROM scrobbles s
        JOIN tracks t ON s.track_id = t.id
        JOIN users u ON s.user_id = u.id
        WHERE u.username IN :twins
          AND t.artist NOT IN (
              SELECT DISTINCT t2.artist FROM scrobbles s2 JOIN tracks t2 ON s2.track_id = t2.id WHERE s2.user_id = :my_id
          )
        GROUP BY t.artist
        ORDER BY plays DESC
        LIMIT 10
    """)
    recs = db.execute(sql, {"twins": tuple(twin_names), "my_id": user.id}).fetchall()
    data = [{"artist": r[0], "cover_url": r[1], "reason": "Слушают ваши вкусовые близнецы"} for r in recs]
    set_to_cache(cache_key, data)
    return data

@app.get("/api/stats/wrapped")
def get_wrapped_stats(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    last_month = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
    base_filter = [Scrobble.user_id == user.id, Scrobble.played_at >= last_month, Scrobble.listened_sec * 100 >= Track.duration * 85]
    top_artist = db.query(Track.artist, func.count(Scrobble.id)).join(Scrobble).filter(*base_filter).group_by(Track.artist).order_by(text('count_1 DESC')).first()
    total_min = db.query(func.sum(Scrobble.listened_sec)).join(Track).filter(*base_filter).scalar() or 0
    return {
        "period": "За последние 30 дней",
        "top_artist": top_artist[0] if top_artist else "Нет данных",
        "total_minutes": int(total_min // 60),
        "status": "Legendary" if total_min > 5000 else "Active"
    }

@app.get("/api/user/mood")
def get_user_mood(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    
    # Analyze last 10 tracks
    recent = db.query(Track.genre, Track.title).join(Scrobble).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).limit(10).all()
    if not recent: return {"mood": "Тишина", "emoji": "😶"}
    
    genres = [r[0].lower() if r[0] else "" for r in recent]
    titles = [r[1].lower() if r[1] else "" for r in recent]
    
    if any(g in ['rock', 'metal', 'phonk'] for g in genres): return {"mood": "Энергичный хайп", "emoji": "🔥"}
    if any(g in ['lofi', 'jazz', 'ambient', 'classical'] for g in genres): return {"mood": "Фокус и чилл", "emoji": "📚"}
    if any(g in ['pop', 'dance', 'electronic'] for g in genres): return {"mood": "Танцевальный вайб", "emoji": "💃"}
    if any(w in titles for w in ['sad', 'lonely', 'rain', 'cry']): return {"mood": "Меланхолия", "emoji": "🌧️"}
    
    return {"mood": "Меломан", "emoji": "🎧"}

@app.get("/api/search/taste")
def search_by_taste(my_username: str, db: Session = Depends(get_db)):
    # Find people with highest taste match
    all_users = db.query(User).filter(User.username != my_username).limit(50).all()
    results = []
    for u in all_users:
        match_data = get_taste_match_internal(my_username, u.username, db)
        if match_data and match_data['match'] > 50:
            results.append({
                "username": u.username,
                "display_name": u.display_name or u.username,
                "avatar_url": u.avatar_url,
                "match": match_data['match']
            })
    results.sort(key=lambda x: x['match'], reverse=True)
    return results[:10]

@app.get("/api/feed/global")
def get_global_feed(db: Session = Depends(get_db)):
    # Latest scrobbles from public users
    scrobbles = db.query(Scrobble).join(User).filter(User.is_private == False).order_by(Scrobble.id.desc()).limit(20).all()
    return {"feed": [format_history_item(s, s.track) for s in scrobbles]}

@app.get("/api/admin/stats")
def get_admin_stats(api_key: str, db: Session = Depends(get_db)):
    admin = get_admin_user(api_key, db) # Auth check
    
    total_users = db.query(User).count()
    total_scrobbles = db.query(Scrobble).count()
    total_tracks = db.query(Track).count()
    active_ws = {u: len(conns) for u, conns in manager.active_connections.items()}
    
    # Get users with scrobble counts and levels
    users = db.query(User).all()
    user_list = []
    for u in users:
        scrobble_count = db.query(Scrobble).filter(Scrobble.user_id == u.id).count()
        lvl, rank, total_xp, _ = get_user_level_info(u, db)
        user_list.append({
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "bio": u.bio,
            "is_verified": u.is_verified,
            "total_xp": total_xp,
            "level": lvl,
            "rank": rank,
            "scrobbles": scrobble_count,
            "is_dev": u.username in DEVELOPERS
        })
    
    # Get latest tracks
    tracks = db.query(Track).order_by(Track.id.desc()).limit(50).all()
    track_list = [{"id": t.id, "title": t.title, "artist": t.artist, "cover_url": t.cover_url, "track_url": t.track_url} for t in tracks]
    
    # Get all achievements
    achievements = db.query(Achievement).all()
    ach_list = [{
        "id": a.id, "name": a.name, "description": a.description, "icon": a.icon,
        "rule_type": a.rule_type, "rule_value": a.rule_value, "rule_target": a.rule_target,
        "rule_meta": a.rule_meta, "target_image": a.target_image, "reward_xp": a.reward_xp
    } for a in achievements]
    
    return {
        "total_users": total_users,
        "total_scrobbles": total_scrobbles,
        "total_tracks": total_tracks,
        "active_websockets": active_ws,
        "users": user_list,
        "tracks": track_list,
        "achievements": ach_list,
        "cache_size": len(CACHE),
        "uptime_sec": int(time.time() - START_TIME) if 'START_TIME' in globals() else 0
    }

@app.post("/api/profile/privacy")
def update_privacy(data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.get("api_key")).first()
    if not user: raise HTTPException(401)
    
    if "is_private" in data: user.is_private = bool(data["is_private"])
    if "hidden_artists" in data: user.hidden_artists = str(data["hidden_artists"])
    db.commit()
    return {"status": "ok"}

@app.post("/api/profile/achievements/toggle")
def toggle_achievement(data: ToggleAch, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.api_key).first()
    if not user: raise HTTPException(401)
    ua = db.query(UserAchievement).filter_by(user_id=user.id, achievement_id=data.achievement_id).first()
    if not ua: raise HTTPException(404)
    ua.is_displayed = not ua.is_displayed
    db.commit()
    return {"status": "ok", "is_displayed": ua.is_displayed}

@app.post("/api/profile/update")
async def update_profile(data: ProfileUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.api_key).first()
    if not user: raise HTTPException(401)
    
    # Update only provided fields (avoiding None overwrites)
    if data.theme is not None: user.theme = data.theme
    
    if data.favorite_artist_url is not None:
        if data.favorite_artist_url.strip() == "":
            user.favorite_artist = user.favorite_artist_cover = user.favorite_artist_url = None
        else:
            title, img = await parse_og_meta(data.favorite_artist_url)
            user.favorite_artist_cover = img or user.favorite_artist_cover
            user.favorite_artist = sanitize_text(title or data.favorite_artist) or user.favorite_artist
            user.favorite_artist_url = data.favorite_artist_url
    
    if data.favorite_track_url is not None:
        if data.favorite_track_url.strip() == "":
            user.favorite_track = user.favorite_track_cover = user.favorite_track_url = None
        else:
            title, img = await parse_og_meta(data.favorite_track_url)
            user.favorite_track_cover = img or user.favorite_track_cover
            user.favorite_track = sanitize_text(title or data.favorite_track) or user.favorite_track
            user.favorite_track_url = data.favorite_track_url
    
    if data.favorite_album_url is not None:
        if data.favorite_album_url.strip() == "":
            user.favorite_album = user.favorite_album_cover = user.favorite_album_url = None
        else:
            title, img = await parse_og_meta(data.favorite_album_url)
            user.favorite_album_cover = img or user.favorite_album_cover
            user.favorite_album = sanitize_text(title or data.favorite_album) or user.favorite_album
            user.favorite_album_url = data.favorite_album_url
    
    if data.display_name is not None: user.display_name = sanitize_text(data.display_name)
    if data.bio is not None: user.bio = sanitize_text(data.bio)
    if data.avatar_url is not None: user.avatar_url = data.avatar_url
    if data.cover_url is not None: user.cover_url = data.cover_url
    if data.location is not None: user.location = sanitize_text(data.location)
    if data.favorite_genre is not None: user.favorite_genre = sanitize_text(data.favorite_genre)
    if data.equipment is not None: user.equipment = sanitize_text(data.equipment)
    if data.is_private is not None: user.is_private = data.is_private
    if data.hidden_artists is not None: user.hidden_artists = sanitize_text(data.hidden_artists) or ""
    if data.lastfm_username is not None: user.lastfm_username = sanitize_text(data.lastfm_username)
    
    if data.social_links is not None:
        try:
            import json
            json.loads(data.social_links)
            user.social_links = data.social_links
        except: pass
        
    db.commit()
    return {"status": "ok"}

@app.get("/api/detailed-stats/{username}")
def get_detailed_stats(username: str, period: str = "all", db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    
    base_filter = [Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85]
    if period == "7d":
        base_filter.append(Scrobble.played_at >= datetime.utcnow() - timedelta(days=7))
    elif period == "30d":
        base_filter.append(Scrobble.played_at >= datetime.utcnow() - timedelta(days=30))
        
    # 1. General Stats
    total_scrobbles = db.query(func.count(Scrobble.id)).join(Track).filter(*base_filter).scalar() or 0
    total_sec = db.query(func.sum(Scrobble.listened_sec)).join(Track).filter(*base_filter).scalar() or 0
    unique_artists = db.query(func.count(func.distinct(Track.artist))).join(Scrobble).filter(*base_filter).scalar() or 0
    unique_tracks = db.query(func.count(func.distinct(Track.id))).join(Scrobble).filter(*base_filter).scalar() or 0
    
    # 2. Top Artists
    top_artists_raw = db.query(Track.artist, func.count(Scrobble.id).label('plays'))\
        .join(Scrobble).filter(*base_filter).group_by(Track.artist)\
        .order_by(text('plays DESC')).limit(10).all()
    
    # 3. Top Tracks
    top_tracks_raw = db.query(Track.title, Track.artist, Track.cover_url, Track.track_url, func.count(Scrobble.id).label('plays'))\
        .join(Scrobble).filter(*base_filter).group_by(Track.id)\
        .order_by(text('plays DESC')).limit(10).all()
        
    # 4. Top Albums
    top_albums_raw = db.query(Track.album, Track.artist, Track.cover_url, func.count(Scrobble.id).label('plays'))\
        .join(Scrobble).filter(*base_filter, Track.album != None)\
        .group_by(Track.album, Track.artist)\
        .order_by(text('plays DESC')).limit(10).all()

    # 5. Genre & Source counts
    genres = db.query(Track.genre, func.count(Scrobble.id)).join(Scrobble).filter(*base_filter, Track.genre != None).group_by(Track.genre).all()
    sources = db.query(Scrobble.source, func.count(Scrobble.id)).join(Track).filter(*base_filter).group_by(Scrobble.source).all()
    
    # 6. Activity (Simplified for performance)
    # Note: Complex timezone grouping is better in Python if row count is low, but here we estimate
    hours_raw = db.query(func.strftime('%H', Scrobble.played_at), func.count(Scrobble.id)).join(Track).filter(*base_filter).group_by(func.strftime('%H', Scrobble.played_at)).all()
    hours_activity = {f"{i:02d}": 0 for i in range(24)}
    for h, count in hours_raw: hours_activity[h] = count

    return {
        "user": {"username": user.username, "display_name": user.display_name or user.username, "avatar_url": user.avatar_url},
        "total_time_min": int(total_sec // 60),
        "total_scrobbles": total_scrobbles,
        "unique_artists": unique_artists,
        "unique_tracks": unique_tracks,
        "top_artists": [{"name": r[0], "plays": r[1], "source": "web"} for r in top_artists_raw],
        "top_tracks": [{"title": r[0], "artist": r[1], "cover_url": r[2], "track_url": r[3], "plays": r[4], "source": "web"} for r in top_tracks_raw],
        "top_albums": [{"album": r[0], "artist": r[1], "cover_url": r[2], "plays": r[3], "source": "web"} for r in top_albums_raw],
        "genre_counts": dict(genres),
        "source_counts": dict(sources),
        "activity_graph": {}, # Full graph is expensive, usually handled by a separate simpler endpoint
        "hours_activity": hours_activity,
        "days_activity": {}
    }
@app.get("/api/history/{username}")
def get_history(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    scrobbles = db.query(Scrobble, Track).join(Track).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).limit(10).all()
    
    # Batch fetch likes/comments to avoid N+1
    s_ids = [s.id for s, t in scrobbles]
    likes = db.query(ScrobbleLike.scrobble_id, func.count(ScrobbleLike.id)).filter(ScrobbleLike.scrobble_id.in_(s_ids)).group_by(ScrobbleLike.scrobble_id).all()
    comments = db.query(ScrobbleComment.scrobble_id, func.count(ScrobbleComment.id)).filter(ScrobbleComment.scrobble_id.in_(s_ids)).group_by(ScrobbleComment.scrobble_id).all()
    
    counters = {sid: {"likes": 0, "comments": 0} for sid in s_ids}
    for sid, count in likes: counters[sid]["likes"] = count
    for sid, count in comments: counters[sid]["comments"] = count
    
    return {"user": username, "history": [format_history_item(s, t, counters=counters) for s, t in scrobbles]}

@app.get("/api/stats/{username}")
def get_stats(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    streak = get_active_streak(user)
    
    scrobbles = db.query(Scrobble, Track).join(Track).filter(
        Scrobble.user_id == user.id, 
        Scrobble.listened_sec * 100 >= Track.duration * 85
    ).all()
    
    total_scrobbles = len(scrobbles)
    scrobbles_xp = sum(s.xp_earned for s, t in scrobbles)
    base_xp = scrobbles_xp + (user.bonus_xp or 0)
    total_xp = int(base_xp * 1.1) if streak >= 7 else base_xp 
    
    artist_counts = {}
    track_counts = {}
    track_meta = {}
    
    for s, t in scrobbles:
        for a in t.artist.split(','):
            a_clean = a.strip()
            if a_clean not in artist_counts:
                artist_counts[a_clean] = {"plays": 0, "sources": {}}
            artist_counts[a_clean]["plays"] += 1
            artist_counts[a_clean]["sources"][s.source] = artist_counts[a_clean]["sources"].get(s.source, 0) + 1
            
        track_key = f"{t.artist.strip().lower()} - {t.title.strip().lower()}"
        if track_key not in track_counts:
            track_counts[track_key] = {"plays": 0, "sources": {}}
        track_counts[track_key]["plays"] += 1
        track_counts[track_key]["sources"][s.source] = track_counts[track_key]["sources"].get(s.source, 0) + 1
        
        if track_key not in track_meta:
            track_meta[track_key] = {"title": t.title, "artist": t.artist, "cover_url": t.cover_url, "track_url": t.track_url}

    top_artists = sorted(artist_counts.items(), key=lambda x: (x[1]["plays"], x[0]), reverse=True)[:5]
    top_tracks = sorted(track_counts.items(), key=lambda x: (x[1]["plays"], x[0]), reverse=True)[:5]
    
    return {
        "total_scrobbles": total_scrobbles, 
        "total_xp": total_xp, 
        "top_tracks": [{"title": track_meta[tkey]["title"], "artist": track_meta[tkey]["artist"], "cover_url": track_meta[tkey]["cover_url"], "track_url": track_meta[tkey]["track_url"], "plays": v["plays"], "source": max(v["sources"].items(), key=lambda elem: elem[1])[0]} for tkey, v in top_tracks], 
        "top_artists": [{"artist": k, "plays": v["plays"], "source": max(v["sources"].items(), key=lambda elem: elem[1])[0]} for k, v in top_artists]
    }

@app.get("/api/activity/{username}")
def get_activity(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    
    scrobbles = db.query(Scrobble.played_at).join(Track).filter(
        Scrobble.user_id == user.id, 
        Scrobble.listened_sec * 100 >= Track.duration * 85
    ).all()
    
    activity_dict = {}
    for (played_at,) in scrobbles:
        local_dt = played_at.replace(tzinfo=timezone.utc).astimezone()
        date_str = local_dt.strftime('%Y-%m-%d')
        activity_dict[date_str] = activity_dict.get(date_str, 0) + 1
        
    return activity_dict

@app.get("/api/current-track/{username}")
def get_current_track(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return {"playing": False}
        
    last_scrobble = db.query(Scrobble, Track).join(Track).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).first()
    
    if not last_scrobble:
        return {"playing": False}
        
    s, t = last_scrobble
    is_active = s.is_playing and (datetime.now(timezone.utc).replace(tzinfo=None) - (s.updated_at or s.played_at)).total_seconds() < 900
    
    if is_active:
        lvl, rank, _, _ = get_user_level_info(user, db)
        return {
            "playing": True,
            "title": t.title,
            "artist": t.artist,
            "cover_url": t.cover_url,
            "level": lvl,
            "rank": rank
        }
    return {"playing": False}

class LikeRequest(BaseModel): api_key: str
class CommentRequest(BaseModel): api_key: str; content: str

@app.post("/api/scrobble/{scrobble_id}/like")
def toggle_like(scrobble_id: int, data: LikeRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.api_key).first()
    if not user: raise HTTPException(401)
    like = db.query(ScrobbleLike).filter_by(user_id=user.id, scrobble_id=scrobble_id).first()
    if like:
        db.delete(like); db.commit()
        return {"status": "unliked"}
    else:
        db.add(ScrobbleLike(user_id=user.id, scrobble_id=scrobble_id)); db.commit()
        return {"status": "liked"}

@app.post("/api/scrobble/{scrobble_id}/comment")
def add_comment(scrobble_id: int, data: CommentRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.api_key).first()
    if not user: raise HTTPException(401)
    # Sanitize comment content to prevent XSS
    clean_content = sanitize_text(data.content)
    db.add(ScrobbleComment(user_id=user.id, scrobble_id=scrobble_id, content=clean_content))
    db.commit()
    return {"status": "ok"}

@app.get("/api/scrobble/{scrobble_id}/comments")
def get_comments(scrobble_id: int, db: Session = Depends(get_db)):
    comments = db.query(ScrobbleComment, User.username, User.avatar_url).join(User).filter(ScrobbleComment.scrobble_id == scrobble_id).all()
    return [{"id": c.ScrobbleComment.id, "content": c.ScrobbleComment.content, "username": c.username, "avatar_url": c.avatar_url, "created_at": c.ScrobbleComment.created_at} for c in comments]

@app.get("/api/global-history")
@app.get("/api/feed/global")
def get_global_history(db: Session = Depends(get_db)):
    # Only show recent scrobbles in the global feed (last 48 hours)
    time_threshold = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=48)
    scrobbles = db.query(Scrobble, Track, User).join(Track).join(User).filter(
        User.is_private == False,
        Scrobble.played_at >= time_threshold
    ).order_by(Scrobble.id.desc()).limit(30).all()
    
    s_ids = [s.id for s, t, u in scrobbles]
    likes = db.query(ScrobbleLike.scrobble_id, func.count(ScrobbleLike.id)).filter(ScrobbleLike.scrobble_id.in_(s_ids)).group_by(ScrobbleLike.scrobble_id).all()
    comments = db.query(ScrobbleComment.scrobble_id, func.count(ScrobbleComment.id)).filter(ScrobbleComment.scrobble_id.in_(s_ids)).group_by(ScrobbleComment.scrobble_id).all()
    
    counters = {sid: {"likes": 0, "comments": 0} for sid in s_ids}
    for sid, count in likes: counters[sid]["likes"] = count
    for sid, count in comments: counters[sid]["comments"] = count

    res = []
    # Cache for "listening together" to avoid redundant queries
    active_now = {} # track_id -> [usernames]
    
    for s, t, u in scrobbles:
        data = format_history_item(s, t, counters=counters)
        data.update({"username": u.username, "is_verified": u.is_verified})
        
        if data["is_playing"]:            
            if t.id not in active_now:
                others = db.query(User.username).join(Scrobble).filter(
                    Scrobble.track_id == t.id,
                    Scrobble.is_playing == True,
                    Scrobble.updated_at >= datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=15)
                ).all()
                active_now[t.id] = [ou.username for ou in others]
            
            data["listening_with"] = [un for un in active_now[t.id] if un != u.username]
        
        res.append(data)
    return res

@app.post("/api/follow/{target_username}")
def toggle_follow(target_username: str, data: FollowAction, db: Session = Depends(get_db)):
    follower = db.query(User).filter(User.api_key == data.api_key).first()
    target = db.query(User).filter(User.username == target_username).first()
    if not follower or not target or follower.id == target.id: raise HTTPException(400)
    existing = db.query(Follow).filter(Follow.follower_id == follower.id, Follow.following_id == target.id).first()
    if existing:
        db.delete(existing); db.commit()
        return {"status": "unfollowed"}
    else:
        db.add(Follow(follower_id=follower.id, following_id=target.id)); db.commit()
        return {"status": "followed"}

@app.get("/api/follow-stats/{viewer}/{profile}")
def get_follow_stats(viewer: str, profile: str, db: Session = Depends(get_db)):
    target = db.query(User).filter(User.username == profile).first()
    if not target: raise HTTPException(404)
    followers_count = db.query(Follow).filter(Follow.following_id == target.id).count()
    following_count = db.query(Follow).filter(Follow.follower_id == target.id).count()
    is_following = False
    if viewer != 'null':
        viewer_user = db.query(User).filter(User.username == viewer).first()
        if viewer_user: is_following = db.query(Follow).filter(Follow.follower_id == viewer_user.id, Follow.following_id == target.id).first() is not None
    return {"followers": followers_count, "following": following_count, "is_following": is_following}

@app.get("/api/followers/{username}")
def get_followers(username: str, request: Request, db: Session = Depends(get_db)):
    target = db.query(User).filter(User.username == username).first()
    if not target: raise HTTPException(404)
    
    # Privacy check
    api_key = request.query_params.get("api_key")
    is_owner = api_key and target.api_key == api_key
    if target.is_private and not is_owner:
        return []

    followers = db.query(User).join(Follow, Follow.follower_id == User.id).filter(Follow.following_id == target.id).all()
    res = []
    for u in followers:
        lvl, rank, _, theme = get_user_level_info(u, db)
        res.append({"username": u.username, "display_name": u.display_name or u.username, "avatar_url": u.avatar_url, "is_verified": u.is_verified, "role": "developer" if u.username in DEVELOPERS else "tester" if u.username in TESTERS else "user", "level": lvl})
    return res

@app.get("/api/following/{username}")
def get_following(username: str, request: Request, db: Session = Depends(get_db)):
    target = db.query(User).filter(User.username == username).first()
    if not target: raise HTTPException(404)

    # Privacy check
    api_key = request.query_params.get("api_key")
    is_owner = api_key and target.api_key == api_key
    if target.is_private and not is_owner:
        return []

    following = db.query(User).join(Follow, Follow.following_id == User.id).filter(Follow.follower_id == target.id).all()
    res = []
    for u in following:
        lvl, rank, _, theme = get_user_level_info(u, db)
        res.append({"username": u.username, "display_name": u.display_name or u.username, "avatar_url": u.avatar_url, "is_verified": u.is_verified, "role": "developer" if u.username in DEVELOPERS else "tester" if u.username in TESTERS else "user", "level": lvl})
    return res

@app.get("/api/friends-history/{username}")
def get_friends_history(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    following_ids = [f.following_id for f in db.query(Follow.following_id).filter(Follow.follower_id == user.id).all()]
    if not following_ids: return []
    scrobbles = db.query(Scrobble, Track, User).join(Track).join(User, Scrobble.user_id == User.id).filter(Scrobble.user_id.in_(following_ids)).order_by(Scrobble.id.desc()).limit(30).all()
    res = []
    active_now = {}
    for s, t, u in scrobbles:
        data = format_history_item(s, t, db)
        data.update({"username": u.username, "is_verified": u.is_verified})
        if data["is_playing"]:
            if t.id not in active_now:
                others = db.query(User.username).join(Scrobble).filter(
                    Scrobble.track_id == t.id,
                    Scrobble.is_playing == True,
                    Scrobble.updated_at >= datetime.utcnow() - timedelta(seconds=15)
                ).all()
                active_now[t.id] = [ou.username for ou in others]
            data["listening_with"] = [un for un in active_now[t.id] if un != u.username]
        res.append(data)
    return res

@app.get("/api/leaderboard")
def get_leaderboard(db: Session = Depends(get_db)):
    # Calculate XP for all users in one query
    sql = text("""
        SELECT u.username, u.display_name, u.avatar_url, u.is_verified, u.theme,
               (COALESCE(SUM(s.xp_earned), 0) + u.bonus_xp) as total_xp
        FROM users u
        LEFT JOIN scrobbles s ON u.id = s.user_id
        GROUP BY u.id
        ORDER BY total_xp DESC
        LIMIT 50
    """)
    
    rows = db.execute(sql).fetchall()
    res = []
    for r in rows:
        uname, dname, avatar, verified, theme, txp = r
        lvl = (txp // 100) + 1
        res.append({
            "username": uname,
            "display_name": dname or uname,
            "avatar_url": avatar,
            "total_xp": txp,
            "level": lvl,
            "is_verified": verified,
            "role": "developer" if uname in DEVELOPERS else "tester" if uname in TESTERS else "user",
            "theme": theme
        })
    return res

@app.get("/api/redirect")
async def smart_redirect(source: str, type: str, q: str):
    if source == "yandex":
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"https://music.yandex.ru/handlers/music-search.jsx?text={urllib.parse.quote(q)}&type={type}s", headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
                res = resp.json()
                if type == "artist":
                    items = res.get("artists", {}).get("items", [])
                    if items: return RedirectResponse(url=f"https://music.yandex.ru/artist/{items[0]['id']}")
                elif type == "album":
                    items = res.get("albums", {}).get("items", [])
                    if items: return RedirectResponse(url=f"https://music.yandex.ru/album/{items[0]['id']}")
                elif type == "track":
                    items = res.get("tracks", {}).get("items", [])
                    if items:
                        alb_id = items[0].get("albums", [{}])[0].get("id")
                        if alb_id: return RedirectResponse(url=f"https://music.yandex.ru/album/{alb_id}/track/{items[0]['id']}")
        except Exception as e:
            print(f"Redirect error: {e}")
        if type == "artist": return RedirectResponse(url=f"https://music.yandex.ru/search?text={urllib.parse.quote(q)}&type=artists")
        if type == "album": return RedirectResponse(url=f"https://music.yandex.ru/search?text={urllib.parse.quote(q)}&type=albums")
        if type == "track": return RedirectResponse(url=f"https://music.yandex.ru/search?text={urllib.parse.quote(q)}&type=tracks")
        
    return RedirectResponse(url="https://music.yandex.ru")

@app.get("/api/search/users")
def search_users(q: str, db: Session = Depends(get_db)):
    if not q or len(q) < 2: return []
    users = db.query(User).filter((User.username.ilike(f"%{q}%")) | (User.display_name.ilike(f"%{q}%"))).limit(10).all()
    res = []
    for u in users:
        lvl, rank, _, theme = get_user_level_info(u, db)
        res.append({"username": u.username, "display_name": u.display_name or u.username, "avatar_url": u.avatar_url, "is_verified": u.is_verified, "role": "developer" if u.username in DEVELOPERS else "tester" if u.username in TESTERS else "user", "level": lvl})
    return res

# Removed duplicate get_admin_stats endpoint

@app.get("/api/public-stats")
def get_public_stats(db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    total_scrobbles = db.query(Scrobble).join(Track).filter(Scrobble.listened_sec * 100 >= Track.duration * 85).count()
    total_tracks = db.query(Track).count()
    
    # Считаем онлайн за последние 5 минут
    five_mins_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
    online_count = db.query(func.count(func.distinct(Scrobble.user_id))).filter(Scrobble.updated_at >= five_mins_ago).scalar() or 0
    
    return {"total_users": total_users, "total_scrobbles": total_scrobbles, "total_tracks": total_tracks, "online": online_count}

@app.post("/api/admin/users/{target_username}/verify")
def toggle_user_verification(target_username: str, data: VerifyUserRequest, db: Session = Depends(get_db)):
    get_admin_user(data.api_key, db) # Robust auth check
    target_user = db.query(User).filter(User.username == target_username).first()
    if not target_user: raise HTTPException(404, "Юзер не найден")
    target_user.is_verified = data.is_verified
    db.commit()
    return {"status": "ok", "is_verified": target_user.is_verified}

@app.post("/api/admin/users/{target_username}/level")
def update_user_level(target_username: str, data: LevelUpdate, db: Session = Depends(get_db)):
    get_admin_user(data.api_key, db)
    target = db.query(User).filter(User.username == target_username).first()
    target.bonus_xp = ((data.new_level - 1) * 100) - db.query(Scrobble).join(Track).filter(Scrobble.user_id == target.id, Scrobble.listened_sec * 100 >= Track.duration * 85).count()
    db.commit()
    return {"status": "ok"}

@app.put("/api/admin/users/{target_username}")
def edit_user_profile(target_username: str, data: AdminUserUpdate, db: Session = Depends(get_db)):
    get_admin_user(data.api_key, db)
    target = db.query(User).filter(User.username == target_username).first()
    if not target: raise HTTPException(404)
    if data.display_name is not None: target.display_name = sanitize_text(data.display_name)
    if data.bio is not None: target.bio = sanitize_text(data.bio)
    if data.avatar_url is not None: target.avatar_url = data.avatar_url
    db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/users/{target_username}/scrobbles")
def wipe_user_scrobbles(target_username: str, api_key: str, db: Session = Depends(get_db)):
    get_admin_user(api_key, db)
    target = db.query(User).filter(User.username == target_username).first()
    if not target: raise HTTPException(404)
    db.query(Scrobble).filter(Scrobble.user_id == target.id).delete()
    db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/tracks/{track_id}")
def delete_track(track_id: int, api_key: str, db: Session = Depends(get_db)):
    get_admin_user(api_key, db)
    db.query(Scrobble).filter(Scrobble.track_id == track_id).delete()
    db.query(Track).filter(Track.id == track_id).delete()
    db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/users/{target_username}")
def delete_user(target_username: str, api_key: str, db: Session = Depends(get_db)):
    get_admin_user(api_key, db)
    target = db.query(User).filter(User.username == target_username).first()
    if target.username in DEVELOPERS: raise HTTPException(400, "Нельзя удалить разработчика")
    db.query(UserAchievement).filter(UserAchievement.user_id == target.id).delete()
    db.query(Follow).filter((Follow.follower_id == target.id) | (Follow.following_id == target.id)).delete()
    db.query(Scrobble).filter(Scrobble.user_id == target.id).delete()
    db.delete(target); db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/users/{target_username}/achievements/{achievement_id}")
def remove_achievement_from_user(target_username: str, achievement_id: int, api_key: str, db: Session = Depends(get_db)):
    get_admin_user(api_key, db)
    target = db.query(User).filter(User.username == target_username).first()
    if not target: raise HTTPException(404, "Юзер не найден")
    ua = db.query(UserAchievement).filter_by(user_id=target.id, achievement_id=achievement_id).first()
    if ua:
        ach = db.query(Achievement).filter_by(id=achievement_id).first()
        if ach: target.bonus_xp = (target.bonus_xp or 0) - (ach.reward_xp or 0)
        db.delete(ua)
        db.commit()
    return {"status": "ok"}

@app.post("/api/admin/achievements")
async def create_achievement(data: AchCreate, db: Session = Depends(get_db)):
    get_admin_user(data.api_key, db)
    target_val = data.rule_target
    val = data.rule_value
    t_img = data.target_image
    meta_text = data.rule_meta
    if data.rule_type in ["specific_track", "specific_album", "specific_artist"] and target_val and target_val.startswith("http"):
        if "avatars.yandex.net" not in target_val and "scdn.co" not in target_val:
            title, img = await parse_og_meta(target_val)
            if img: t_img = img
            if title and data.rule_type in ["specific_track", "specific_artist"] and not meta_text: meta_text = title
            if title and data.rule_type == "specific_artist": target_val = f"{title}||{data.rule_target}" 
            if data.rule_type == "specific_album":
                track_count = await get_album_track_count(target_val)
                if track_count > 0: val = track_count 
        else: t_img = target_val 
    db.add(Achievement(name=data.name, description=data.description, icon=data.icon, rule_type=data.rule_type, rule_value=val, rule_target=target_val, target_image=t_img, reward_xp=data.reward_xp, rule_meta=meta_text))
    db.commit()
    return {"status": "ok"}

@app.put("/api/admin/achievements/{ach_id}")
async def update_achievement(ach_id: int, data: AchUpdate, db: Session = Depends(get_db)):
    get_admin_user(data.api_key, db)
    ach = db.query(Achievement).filter(Achievement.id == ach_id).first()
    target_val = data.rule_target
    val = data.rule_value
    t_img = data.target_image
    meta_text = data.rule_meta
    if data.rule_type in ["specific_track", "specific_album", "specific_artist"] and target_val and target_val.startswith("http"):
        if "avatars.yandex.net" not in target_val and "scdn.co" not in target_val:
            title, img = await parse_og_meta(target_val)
            if img: t_img = img
            if title and data.rule_type in ["specific_track", "specific_artist"] and not meta_text: meta_text = title
            if title and data.rule_type == "specific_artist": target_val = f"{title}||{data.rule_target}" 
            if data.rule_type == "specific_album":
                track_count = await get_album_track_count(target_val)
                if track_count > 0: val = track_count 
        else: t_img = target_val 
    ach.name, ach.description, ach.icon, ach.rule_type, ach.rule_value, ach.rule_target, ach.target_image, ach.reward_xp, ach.rule_meta = data.name, data.description, data.icon, data.rule_type, val, target_val, t_img, data.reward_xp, meta_text
    db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/achievements/{ach_id}")
def delete_achievement(ach_id: int, api_key: str, db: Session = Depends(get_db)):
    get_admin_user(api_key, db)
    db.query(UserAchievement).filter(UserAchievement.achievement_id == ach_id).delete()
    db.query(Achievement).filter(Achievement.id == ach_id).delete()
    db.commit()
    return {"status": "ok"}

@app.post("/api/admin/users/{target_username}/achievements")
def assign_achievement(target_username: str, data: AchAssign, db: Session = Depends(get_db)):
    get_admin_user(data.api_key, db)
    user = db.query(User).filter(User.username == target_username).first()
    if not db.query(UserAchievement).filter_by(user_id=user.id, achievement_id=data.achievement_id).first():
        ach = db.query(Achievement).filter_by(id=data.achievement_id).first()
        db.add(UserAchievement(user_id=user.id, achievement_id=data.achievement_id))
        user.bonus_xp = (user.bonus_xp or 0) + (ach.reward_xp or 0)
        db.commit()
    return {"status": "ok"}
