from fastapi import FastAPI, Depends, HTTPException, Request, BackgroundTasks, File, UploadFile
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
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, func, text, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from typing import Optional, List
import bcrypt
import secrets
import urllib.parse
import re
import requests
import asyncio
import base64

SPOTIFY_CLIENT_ID = "1"
SPOTIFY_CLIENT_SECRET = "1"
SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8000/auth/spotify/callback"

DEVELOPERS = {"peaostrel"} 
TESTERS = {"test_user1", "tester_vasya"}

SQLALCHEMY_DATABASE_URL = "sqlite:///./tracker.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
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
    yandex_token = Column(String, nullable=True)
    lastfm_username = Column(String, nullable=True)

class Track(Base):
    __tablename__ = "tracks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    artist = Column(String, index=True)
    cover_url = Column(String, nullable=True)
    track_url = Column(String, nullable=True)
    album = Column(String, nullable=True)
    duration = Column(Integer, default=0)

class Scrobble(Base):
    __tablename__ = "scrobbles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    track_id = Column(Integer, ForeignKey("tracks.id"))
    played_at = Column(DateTime, default=datetime.utcnow)
    source = Column(String)
    listened_sec = Column(Integer, default=0)
    is_playing = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow) 
    xp_earned = Column(Integer, default=1)
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
    user_id = Column(Integer, ForeignKey("users.id"))
    achievement_id = Column(Integer, ForeignKey("achievements.id"))
    earned_at = Column(DateTime, default=datetime.utcnow)
    is_displayed = Column(Boolean, default=True)
    notified = Column(Boolean, default=False)

class Follow(Base):
    __tablename__ = "follows"
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id"))
    following_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)
    for alter_query in [
        "ALTER TABLE achievements ADD COLUMN rule_type VARCHAR DEFAULT 'manual'",
        "ALTER TABLE achievements ADD COLUMN rule_value INTEGER DEFAULT 0",
        "ALTER TABLE achievements ADD COLUMN rule_target VARCHAR",
        "ALTER TABLE achievements ADD COLUMN rule_meta VARCHAR",
        "ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN last_streak_date VARCHAR",
        "ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0",
        "ALTER TABLE achievements ADD COLUMN target_image VARCHAR",
        "ALTER TABLE user_achievements ADD COLUMN is_displayed BOOLEAN DEFAULT 1",
        "ALTER TABLE achievements ADD COLUMN reward_xp INTEGER DEFAULT 0",
        "ALTER TABLE user_achievements ADD COLUMN notified BOOLEAN DEFAULT 0",
        "ALTER TABLE scrobbles ADD COLUMN listened_sec INTEGER DEFAULT 0",
        "ALTER TABLE scrobbles ADD COLUMN is_playing BOOLEAN DEFAULT 1",
        "ALTER TABLE scrobbles ADD COLUMN updated_at DATETIME",
        "ALTER TABLE users ADD COLUMN yandex_token VARCHAR",
        "ALTER TABLE users ADD COLUMN lastfm_username VARCHAR",
        "ALTER TABLE tracks ADD COLUMN album VARCHAR",
        "ALTER TABLE scrobbles ADD COLUMN xp_earned INTEGER DEFAULT 1"
    ]:
        try:
            with engine.connect() as conn:
                conn.execute(text(alter_query))
                conn.commit()
        except: pass

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

class LevelUpdate(BaseModel): api_key: str; new_level: int
class AchCreate(BaseModel): api_key: str; name: str; description: str; icon: str; rule_type: str = "manual"; rule_value: int = 0; rule_target: Optional[str] = None; rule_meta: Optional[str] = None; target_image: Optional[str] = None; reward_xp: int = 0
class AchUpdate(BaseModel): api_key: str; name: str; description: str; icon: str; rule_type: str = "manual"; rule_value: int = 0; rule_target: Optional[str] = None; rule_meta: Optional[str] = None; target_image: Optional[str] = None; reward_xp: int = 0
class AchAssign(BaseModel): api_key: str; achievement_id: int
class ToggleAch(BaseModel): api_key: str; achievement_id: int
class FollowAction(BaseModel): api_key: str
class VerifyUserRequest(BaseModel): api_key: str; is_verified: bool
class MarkRead(BaseModel): ua_ids: List[int]
class AdminUserUpdate(BaseModel): api_key: str; display_name: Optional[str] = None; bio: Optional[str] = None; avatar_url: Optional[str] = None

os.makedirs("uploads", exist_ok=True)
app = FastAPI(title="VEIN Music API")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup_event():
    init_db()

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

@app.get("/uploads/{filename}")
async def get_upload(filename: str, request: Request, db: Session = Depends(get_db)):
    # Проверяем Referer, чтобы разрешить загрузку внутри приложения
    referer = request.headers.get("referer")
    allowed_hosts = ["127.0.0.1:3000", "localhost:3000"]
    
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

def parse_og_meta(url: str):
    if not url: return None, None
    if not url.startswith("http"): url = "https://" + url
    headers = {'User-Agent': 'Mozilla/5.0'}
    title, img = None, None
    if "music.yandex.ru" in url:
        try:
            if "/artist/" in url:
                res = requests.get(f"https://music.yandex.ru/handlers/artist.jsx?artist={url.split('/artist/')[1].split('/')[0].split('?')[0]}", headers=headers, timeout=5).json()
                title, img = res.get("artist", {}).get("name"), "https://" + res.get("artist", {}).get("cover", {}).get("uri", "").replace("%%", "400x400") if res.get("artist", {}).get("cover", {}).get("uri") else None
            elif "/album/" in url and "/track/" not in url:
                res = requests.get(f"https://music.yandex.ru/handlers/album.jsx?album={url.split('/album/')[1].split('/')[0].split('?')[0]}", headers=headers, timeout=5).json()
                title, img = res.get("title"), "https://" + res.get("coverUri", "").replace("%%", "400x400") if res.get("coverUri") else None
            elif "/track/" in url:
                res = requests.get(f"https://music.yandex.ru/handlers/track.jsx?track={url.split('/track/')[1].split('/')[0].split('?')[0]}", headers=headers, timeout=5).json()
                t_data = res.get("track", {})
                title = f"{t_data.get('artists', [{}])[0].get('name')} — {t_data.get('title')}" if t_data.get('artists') else t_data.get('title')
                img = "https://" + (t_data.get("coverUri") or res.get("coverUri", "")).replace("%%", "400x400") if (t_data.get("coverUri") or res.get("coverUri")) else None
        except: pass
    if not title or not img:
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            t_m = re.search(r'<meta\s+(?:property|name)=["\']og:title["\']\s+content=["\']([^"\']+)["\']', resp.text, re.IGNORECASE)
            i_m = re.search(r'<meta\s+(?:property|name)=["\']og:image["\']\s+content=["\']([^"\']+)["\']', resp.text, re.IGNORECASE)
            if not title and t_m: title = t_m.group(1).split(' | ')[0]
            if not img and i_m: img = i_m.group(1).replace('200x200', '400x400').replace('%%', '400x400')
        except: pass
    return title, img

def get_track_duration(url: str) -> int:
    if not url or not url.startswith("http"): return 180 
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        if "music.yandex.ru" in url and "/track/" in url:
            track_id = url.split('/track/')[1].split('/')[0].split('?')[0]
            res = requests.get(f"https://music.yandex.ru/handlers/track.jsx?track={track_id}", headers=headers, timeout=5).json()
            return int(res.get("track", {}).get("durationMs", 180000) / 1000)
    except: pass
    return 180

def get_album_track_count(url: str) -> int:
    if not url or not url.startswith("http"): return 0
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        if "music.yandex.ru" in url and "/album/" in url:
            album_id = url.split('/album/')[1].split('/')[0].split('?')[0]
            res = requests.get(f"https://music.yandex.ru/handlers/album.jsx?album={album_id}", headers=headers, timeout=5).json()
            return res.get("trackCount", 0)
        elif "spotify.com" in url and "/album/" in url:
            resp = requests.get(url, headers=headers, timeout=5)
            match = re.search(r'music:song_count["\']\s+content=["\'](\d+)["\']', resp.text, re.IGNORECASE)
            if match: return int(match.group(1))
    except: pass
    return 0

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

def format_history_item(scrobble, track):
    upd_time = scrobble.updated_at or scrobble.played_at
    is_playing = scrobble.is_playing and (datetime.utcnow() - upd_time).total_seconds() < 15
    return {
        "artist": track.artist, "title": track.title, "cover_url": track.cover_url,
        "track_url": track.track_url, "source": scrobble.source, "time": scrobble.played_at,
        "duration": track.duration, "listened_sec": scrobble.listened_sec,
        "is_playing": is_playing, "updated_at": upd_time
    }

def process_scrobble(db: Session, user: User, title: str, artist: str, cover_url: str, track_url: str, source: str, progress_sec: int, is_playing: bool, duration: int, album: str = None):
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
        track.duration = get_track_duration(track.track_url)
        db.commit()
        
    now = datetime.utcnow()
    last_scrobble = db.query(Scrobble).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).first()
    
    is_new = False
    if not last_scrobble or last_scrobble.track_id != track.id:
        if last_scrobble and last_scrobble.is_playing and (now - last_scrobble.updated_at).total_seconds() < 1.0:
            return "ignored_spam_protection"
        is_new = True
    elif progress_sec < 5 and (last_scrobble.listened_sec or 0) > 30: 
        is_new = True
            
    if is_new:
        db.add(Scrobble(user_id=user.id, track_id=track.id, source=source, played_at=now, listened_sec=0, is_playing=is_playing, updated_at=now))
        db.commit()
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
            
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            scrobbles_today = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.played_at >= today_start, Scrobble.listened_sec * 100 >= Track.duration * 85).count()
            if scrobbles_today >= 5:
                today_str = today_start.strftime("%Y-%m-%d")
                yesterday_str = (today_start - timedelta(days=1)).strftime("%Y-%m-%d")
                if user.last_streak_date != today_str:
                    if user.last_streak_date == yesterday_str: user.current_streak = (user.current_streak or 0) + 1
                    else: user.current_streak = 1
                    user.last_streak_date = today_str
                    db.commit()
            
            check_auto_achievements(user, db)
            
    return "ok"

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join("uploads", filename)
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    return {"url": f"http://127.0.0.1:8000/uploads/{filename}"}

@app.post("/auth/register")
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == data.username).first(): raise HTTPException(400, "Никнейм занят")
    new_user = User(username=data.username, hashed_password=get_password_hash(data.password), api_key=secrets.token_hex(16))
    db.add(new_user); db.commit(); db.refresh(new_user)
    return {"message": "Успешная регистрация", "username": new_user.username, "api_key": new_user.api_key}

@app.post("/auth/login")
def login(data: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password): raise HTTPException(400, "Неверный логин/пароль")
    return {"username": user.username, "api_key": user.api_key}

@app.post("/api/scrobble")
def add_scrobble(data: ScrobbleData, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.api_key == data.api_key).first()
        if not user: 
            raise HTTPException(401)
        res = process_scrobble(db, user, data.title, data.artist, data.cover_url, data.track_url, data.source, data.progress_sec, data.is_playing, data.duration, data.album)
        return {"status": res}
    except Exception as e:
        raise e

@app.get("/api/user/{username}")
def get_user_info(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404, "Юзер не найден")
    check_auto_achievements(user, db)
    role = "developer" if user.username in DEVELOPERS else "tester" if user.username in TESTERS else "user"
    ach_data = db.query(Achievement, UserAchievement).join(UserAchievement, Achievement.id == UserAchievement.achievement_id).filter(UserAchievement.user_id == user.id).all()
    return {
        "username": user.username, "display_name": user.display_name or user.username, "bio": user.bio or "Этот пользователь пока ничего о себе не рассказал.",
        "avatar_url": user.avatar_url, "cover_url": user.cover_url, "location": user.location, "favorite_genre": user.favorite_genre, "equipment": user.equipment,
        "social_links": user.social_links or "[]", "theme": user.theme or "classic", "is_verified": user.is_verified,
        "favorite_artist": user.favorite_artist, "favorite_artist_url": user.favorite_artist_url, "favorite_artist_cover": user.favorite_artist_cover,
        "favorite_track": user.favorite_track, "favorite_track_url": user.favorite_track_url, "favorite_track_cover": user.favorite_track_cover, 
        "favorite_album": user.favorite_album, "favorite_album_url": user.favorite_album_url, "favorite_album_cover": user.favorite_album_cover,
        "spotify_linked": bool(user.spotify_refresh_token), "role": role,
        "achievements": [{"id": a.id, "name": a.name, "description": a.description, "icon": a.icon, "target_image": a.target_image, "reward_xp": a.reward_xp, "is_displayed": ua.is_displayed, "earned_at": ua.earned_at} for a, ua in ach_data],
        "streak": get_active_streak(user)
    }

@app.get("/api/taste-match/{viewer}/{profile}")
def get_taste_match(viewer: str, profile: str, db: Session = Depends(get_db)):
    viewer_user = db.query(User).filter(User.username == viewer).first()
    profile_user = db.query(User).filter(User.username == profile).first()
    if not viewer_user or not profile_user or viewer == profile:
        return {"match": 0, "common_artists": []}
        
    viewer_scrobbles = db.query(Track.artist).join(Scrobble).filter(Scrobble.user_id == viewer_user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).all()
    profile_scrobbles = db.query(Track.artist).join(Scrobble).filter(Scrobble.user_id == profile_user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).all()
    
    viewer_artists = set()
    for t in viewer_scrobbles:
        for a in t[0].split(','): viewer_artists.add(a.strip())
            
    profile_artists = set()
    for t in profile_scrobbles:
        for a in t[0].split(','): profile_artists.add(a.strip())
    
    if not viewer_artists or not profile_artists:
        return {"match": 0, "common_artists": []}
        
    common = viewer_artists.intersection(profile_artists)
    match_percent = int((len(common) / max(len(viewer_artists), len(profile_artists), 1)) * 100)
    
    return {"match": match_percent, "common_artists": list(common)[:5]}

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
def update_profile(data: ProfileUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == data.api_key).first()
    if not user: raise HTTPException(401)
    if data.theme: user.theme = data.theme
    if data.favorite_artist_url:
        title, img = parse_og_meta(data.favorite_artist_url)
        user.favorite_artist_cover = img or user.favorite_artist_cover
        user.favorite_artist = title or data.favorite_artist or user.favorite_artist
        user.favorite_artist_url = data.favorite_artist_url
    else: user.favorite_artist = user.favorite_artist_cover = user.favorite_artist_url = None
    if data.favorite_track_url:
        title, img = parse_og_meta(data.favorite_track_url)
        user.favorite_track_cover = img or user.favorite_track_cover
        user.favorite_track = title or data.favorite_track or user.favorite_track
        user.favorite_track_url = data.favorite_track_url
    else: user.favorite_track = user.favorite_track_cover = user.favorite_track_url = None
    if data.favorite_album_url:
        title, img = parse_og_meta(data.favorite_album_url)
        user.favorite_album_cover = img or user.favorite_album_cover
        user.favorite_album = title or data.favorite_album or user.favorite_album
        user.favorite_album_url = data.favorite_album_url
    else: user.favorite_album = user.favorite_album_cover = user.favorite_album_url = None
    user.display_name = data.display_name; user.bio = data.bio; user.avatar_url = data.avatar_url; user.cover_url = data.cover_url
    user.location = data.location; user.favorite_genre = data.favorite_genre; user.equipment = data.equipment; user.social_links = data.social_links
    db.commit()
    return {"status": "ok"}

@app.get("/api/detailed-stats/{username}")
def get_detailed_stats(username: str, period: str = "all", db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    
    query = db.query(Scrobble, Track).join(Track).filter(
        Scrobble.user_id == user.id,
        Scrobble.listened_sec * 100 >= Track.duration * 85
    )
    
    now = datetime.utcnow()
    if period == "7d":
        query = query.filter(Scrobble.played_at >= now - timedelta(days=7))
    elif period == "30d":
        query = query.filter(Scrobble.played_at >= now - timedelta(days=30))
        
    scrobbles = query.all()
    
    total_sec = sum((s.listened_sec or 0) for s, t in scrobbles)
    total_scrobbles = len(scrobbles)
    
    artist_counts = {}
    track_counts = {}
    album_counts = {}
    track_meta = {}
    activity_graph = {}
    
    unique_tracks_set = set()
    unique_artists_set = set()

    hours_dict = {f"{i:02d}": 0 for i in range(24)}
    days_dict = {d: 0 for d in ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]}
    days_map = {0: "Пн", 1: "Вт", 2: "Ср", 3: "Чт", 4: "Пт", 5: "Сб", 6: "Вс"}
    
    for s, t in scrobbles:
        unique_tracks_set.add(t.id)
        for a in t.artist.split(','):
            a_clean = a.strip()
            unique_artists_set.add(a_clean)
            if a_clean not in artist_counts:
                artist_counts[a_clean] = {"plays": 0, "sources": {}}
            artist_counts[a_clean]["plays"] += 1
            artist_counts[a_clean]["sources"][s.source] = artist_counts[a_clean]["sources"].get(s.source, 0) + 1
            
        if t.id not in track_counts:
            track_counts[t.id] = {"plays": 0, "sources": {}}
        track_counts[t.id]["plays"] += 1
        track_counts[t.id]["sources"][s.source] = track_counts[t.id]["sources"].get(s.source, 0) + 1
        
        if getattr(t, 'album', None):
            alb_key = f"{t.album}::{t.artist}"
            if alb_key not in album_counts:
                album_counts[alb_key] = {"plays": 0, "album": t.album, "artist": t.artist, "cover_url": t.cover_url, "sources": {}}
            album_counts[alb_key]["plays"] += 1
            album_counts[alb_key]["sources"][s.source] = album_counts[alb_key]["sources"].get(s.source, 0) + 1
        
        if t.id not in track_meta:
            track_meta[t.id] = {"title": t.title, "artist": t.artist, "cover_url": t.cover_url, "track_url": t.track_url}
            
        local_dt = s.played_at.replace(tzinfo=timezone.utc).astimezone()
        
        hours_dict[local_dt.strftime('%H')] += 1
        days_dict[days_map[local_dt.weekday()]] += 1
        
        dt_str = local_dt.strftime("%Y-%m-%d")
        activity_graph[dt_str] = activity_graph.get(dt_str, 0) + 1

    top_artists = sorted(artist_counts.items(), key=lambda x: (x[1]["plays"], x[0]), reverse=True)[:10]
    top_tracks_ids = sorted(track_counts.items(), key=lambda x: (x[1]["plays"], x[0]), reverse=True)[:10]
    
    top_albums_list = []
    for v in sorted(album_counts.values(), key=lambda x: x["plays"], reverse=True)[:10]:
        v["source"] = max(v["sources"].items(), key=lambda elem: elem[1])[0]
        top_albums_list.append(v)
    
    return {
        "user": {"username": user.username, "display_name": user.display_name or user.username, "avatar_url": user.avatar_url},
        "total_time_min": total_sec // 60,
        "total_scrobbles": total_scrobbles,
        "unique_artists": len(unique_artists_set),
        "unique_tracks": len(unique_tracks_set),
        "top_artists": [{"name": k, "plays": v["plays"], "source": max(v["sources"].items(), key=lambda elem: elem[1])[0]} for k, v in top_artists],
        "top_tracks": [{"plays": v["plays"], "source": max(v["sources"].items(), key=lambda elem: elem[1])[0], **track_meta[tkey]} for tkey, v in top_tracks_ids],
        "top_albums": top_albums_list,
        "activity_graph": activity_graph,
        "hours_activity": hours_dict,
        "days_activity": days_dict
    }

@app.get("/api/history/{username}")
def get_history(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    scrobbles = db.query(Scrobble, Track).join(Track).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).limit(10).all()
    return {"user": username, "history": [format_history_item(s, t) for s, t in scrobbles]}

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
    is_active = s.is_playing and (datetime.utcnow() - (s.updated_at or s.played_at)).total_seconds() < 900
    
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

@app.get("/api/global-history")
def get_global_history(db: Session = Depends(get_db)):
    scrobbles = db.query(Scrobble, Track, User).join(Track).join(User).order_by(Scrobble.id.desc()).limit(30).all()
    res = []
    for s, t, u in scrobbles:
        data = format_history_item(s, t)
        data.update({"username": u.username, "is_verified": u.is_verified})
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
def get_followers(username: str, db: Session = Depends(get_db)):
    target = db.query(User).filter(User.username == username).first()
    if not target: raise HTTPException(404)
    followers = db.query(User).join(Follow, Follow.follower_id == User.id).filter(Follow.following_id == target.id).all()
    res = []
    for u in followers:
        lvl, rank, _, theme = get_user_level_info(u, db)
        res.append({"username": u.username, "display_name": u.display_name or u.username, "avatar_url": u.avatar_url, "is_verified": u.is_verified, "role": "developer" if u.username in DEVELOPERS else "tester" if u.username in TESTERS else "user", "level": lvl})
    return res

@app.get("/api/following/{username}")
def get_following(username: str, db: Session = Depends(get_db)):
    target = db.query(User).filter(User.username == username).first()
    if not target: raise HTTPException(404)
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
    for s, t, u in scrobbles:
        data = format_history_item(s, t)
        data.update({"username": u.username, "is_verified": u.is_verified})
        res.append(data)
    return res

@app.get("/api/leaderboard")
def get_leaderboard(db: Session = Depends(get_db)):
    all_users = db.query(User).all()
    res = []
    for u in all_users:
        lvl, rank, txp, theme = get_user_level_info(u, db)
        if txp > 0:
            res.append({
                "username": u.username, 
                "display_name": u.display_name or u.username, 
                "avatar_url": u.avatar_url, 
                "total_xp": txp, 
                "level": lvl, 
                "is_verified": u.is_verified, 
                "role": "developer" if u.username in DEVELOPERS else "tester" if u.username in TESTERS else "user",
                "theme": theme
            })
    res.sort(key=lambda x: x["total_xp"], reverse=True)
    return res[:50]

@app.get("/api/redirect")
def smart_redirect(source: str, type: str, q: str):
    if source == "yandex":
        try:
            res = requests.get(f"https://music.yandex.ru/handlers/music-search.jsx?text={urllib.parse.quote(q)}&type={type}s", headers={'User-Agent': 'Mozilla/5.0'}, timeout=5).json()
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
        except: pass
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

@app.get("/api/admin/stats")
def get_admin_stats(api_key: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == api_key).first()
    if not user or user.username not in DEVELOPERS: raise HTTPException(403)
    achievements = db.query(Achievement).all()
    all_users = db.query(User).order_by(User.id.desc()).all()
    users_data = []
    for u in all_users:
        streak = get_active_streak(u)
        base_xp = db.query(Scrobble).join(Track).filter(Scrobble.user_id == u.id, Scrobble.listened_sec * 100 >= Track.duration * 85).count() + (u.bonus_xp or 0)
        total_xp = int(base_xp * 1.1) if streak >= 7 else base_xp
        users_data.append({"username": u.username, "display_name": u.display_name or u.username, "scrobbles": db.query(Scrobble).join(Track).filter(Scrobble.user_id == u.id, Scrobble.listened_sec * 100 >= Track.duration * 85).count(), "total_xp": total_xp, "is_dev": u.username in DEVELOPERS, "is_verified": u.is_verified, "avatar_url": u.avatar_url, "bio": u.bio})
    
    tracks = db.query(Track).order_by(Track.id.desc()).limit(150).all()
    tracks_data = [{"id": t.id, "title": t.title, "artist": t.artist, "cover_url": t.cover_url} for t in tracks]
    
    return {"total_users": len(all_users), "total_scrobbles": db.query(Scrobble).join(Track).filter(Scrobble.listened_sec * 100 >= Track.duration * 85).count(), "total_tracks": db.query(Track).count(), "users": users_data, "achievements": [{"id": a.id, "name": a.name, "description": a.description, "icon": a.icon, "rule_type": a.rule_type, "rule_value": a.rule_value, "rule_target": a.rule_target, "target_image": a.target_image, "reward_xp": a.reward_xp, "rule_meta": a.rule_meta} for a in achievements], "tracks": tracks_data}

@app.get("/api/public-stats")
def get_public_stats(db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    total_scrobbles = db.query(Scrobble).join(Track).filter(Scrobble.listened_sec * 100 >= Track.duration * 85).count()
    total_tracks = db.query(Track).count()
    
    # Считаем онлайн за последние 5 минут
    five_mins_ago = datetime.utcnow() - timedelta(minutes=5)
    online_count = db.query(func.count(func.distinct(Scrobble.user_id))).filter(Scrobble.updated_at >= five_mins_ago).scalar() or 0
    
    return {"total_users": total_users, "total_scrobbles": total_scrobbles, "total_tracks": total_tracks, "online": online_count}

@app.post("/api/admin/users/{target_username}/verify")
def toggle_user_verification(target_username: str, data: VerifyUserRequest, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.api_key == data.api_key).first()
    if not admin or admin.username not in DEVELOPERS: raise HTTPException(403)
    target_user = db.query(User).filter(User.username == target_username).first()
    if not target_user: raise HTTPException(404, "Юзер не найден")
    target_user.is_verified = data.is_verified
    db.commit()
    return {"status": "ok", "is_verified": target_user.is_verified}

@app.post("/api/admin/users/{target_username}/level")
def update_user_level(target_username: str, data: LevelUpdate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == data.api_key).first().username not in DEVELOPERS: raise HTTPException(403)
    target = db.query(User).filter(User.username == target_username).first()
    target.bonus_xp = ((data.new_level - 1) * 100) - db.query(Scrobble).join(Track).filter(Scrobble.user_id == target.id, Scrobble.listened_sec * 100 >= Track.duration * 85).count()
    db.commit()
    return {"status": "ok"}

@app.put("/api/admin/users/{target_username}")
def edit_user_profile(target_username: str, data: AdminUserUpdate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == data.api_key).first().username not in DEVELOPERS: raise HTTPException(403)
    target = db.query(User).filter(User.username == target_username).first()
    if not target: raise HTTPException(404)
    if data.display_name is not None: target.display_name = data.display_name
    if data.bio is not None: target.bio = data.bio
    if data.avatar_url is not None: target.avatar_url = data.avatar_url
    db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/users/{target_username}/scrobbles")
def wipe_user_scrobbles(target_username: str, api_key: str, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == api_key).first().username not in DEVELOPERS: raise HTTPException(403)
    target = db.query(User).filter(User.username == target_username).first()
    if not target: raise HTTPException(404)
    db.query(Scrobble).filter(Scrobble.user_id == target.id).delete()
    db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/tracks/{track_id}")
def delete_track(track_id: int, api_key: str, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == api_key).first().username not in DEVELOPERS: raise HTTPException(403)
    db.query(Scrobble).filter(Scrobble.track_id == track_id).delete()
    db.query(Track).filter(Track.id == track_id).delete()
    db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/users/{target_username}")
def delete_user(target_username: str, api_key: str, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == api_key).first().username not in DEVELOPERS: raise HTTPException(403)
    target = db.query(User).filter(User.username == target_username).first()
    if target.username in DEVELOPERS: raise HTTPException(400, "Нельзя удалить разработчика")
    db.query(UserAchievement).filter(UserAchievement.user_id == target.id).delete()
    db.query(Follow).filter((Follow.follower_id == target.id) | (Follow.following_id == target.id)).delete()
    db.query(Scrobble).filter(Scrobble.user_id == target.id).delete()
    db.delete(target); db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/users/{target_username}/achievements/{achievement_id}")
def remove_achievement_from_user(target_username: str, achievement_id: int, api_key: str, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == api_key).first().username not in DEVELOPERS: raise HTTPException(403)
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
def create_achievement(data: AchCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == data.api_key).first().username not in DEVELOPERS: raise HTTPException(403)
    target_val = data.rule_target
    val = data.rule_value
    t_img = data.target_image
    meta_text = data.rule_meta
    if data.rule_type in ["specific_track", "specific_album", "specific_artist"] and target_val and target_val.startswith("http"):
        if "avatars.yandex.net" not in target_val and "scdn.co" not in target_val:
            title, img = parse_og_meta(target_val)
            if img: t_img = img
            if title and data.rule_type in ["specific_track", "specific_artist"] and not meta_text: meta_text = title
            if title and data.rule_type == "specific_artist": target_val = f"{title}||{data.rule_target}" 
            if data.rule_type == "specific_album":
                track_count = get_album_track_count(target_val)
                if track_count > 0: val = track_count 
        else: t_img = target_val 
    db.add(Achievement(name=data.name, description=data.description, icon=data.icon, rule_type=data.rule_type, rule_value=val, rule_target=target_val, target_image=t_img, reward_xp=data.reward_xp, rule_meta=meta_text))
    db.commit()
    return {"status": "ok"}

@app.put("/api/admin/achievements/{ach_id}")
def update_achievement(ach_id: int, data: AchUpdate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == data.api_key).first().username not in DEVELOPERS: raise HTTPException(403)
    ach = db.query(Achievement).filter(Achievement.id == ach_id).first()
    target_val = data.rule_target
    val = data.rule_value
    t_img = data.target_image
    meta_text = data.rule_meta
    if data.rule_type in ["specific_track", "specific_album", "specific_artist"] and target_val and target_val.startswith("http"):
        if "avatars.yandex.net" not in target_val and "scdn.co" not in target_val:
            title, img = parse_og_meta(target_val)
            if img: t_img = img
            if title and data.rule_type in ["specific_track", "specific_artist"] and not meta_text: meta_text = title
            if title and data.rule_type == "specific_artist": target_val = f"{title}||{data.rule_target}" 
            if data.rule_type == "specific_album":
                track_count = get_album_track_count(target_val)
                if track_count > 0: val = track_count 
        else: t_img = target_val 
    ach.name, ach.description, ach.icon, ach.rule_type, ach.rule_value, ach.rule_target, ach.target_image, ach.reward_xp, ach.rule_meta = data.name, data.description, data.icon, data.rule_type, val, target_val, t_img, data.reward_xp, meta_text
    db.commit()
    return {"status": "ok"}

@app.delete("/api/admin/achievements/{ach_id}")
def delete_achievement(ach_id: int, api_key: str, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == api_key).first().username not in DEVELOPERS: raise HTTPException(403)
    db.query(UserAchievement).filter(UserAchievement.achievement_id == ach_id).delete()
    db.query(Achievement).filter(Achievement.id == ach_id).delete()
    db.commit()
    return {"status": "ok"}

@app.post("/api/admin/users/{target_username}/achievements")
def assign_achievement(target_username: str, data: AchAssign, db: Session = Depends(get_db)):
    if db.query(User).filter(User.api_key == data.api_key).first().username not in DEVELOPERS: raise HTTPException(403)
    user = db.query(User).filter(User.username == target_username).first()
    if not db.query(UserAchievement).filter_by(user_id=user.id, achievement_id=data.achievement_id).first():
        ach = db.query(Achievement).filter_by(id=data.achievement_id).first()
        db.add(UserAchievement(user_id=user.id, achievement_id=data.achievement_id))
        user.bonus_xp = (user.bonus_xp or 0) + (ach.reward_xp or 0)
        db.commit()
    return {"status": "ok"}
