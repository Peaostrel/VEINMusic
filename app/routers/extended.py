from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Annotated
from fastapi import UploadFile, File
from fastapi.responses import FileResponse

from app.schemas import AchCreate, AchUpdate, AchAssign, ToggleAch, MarkRead, LevelUpdate, AdminUserUpdate, ApiKeyRequest

from sqlalchemy.orm import Session
from app.core.security import get_current_user, get_admin_user
from sqlalchemy import text, func
from datetime import datetime, timedelta, timezone
import re
import urllib.parse
TRACK_PATH = "/track/"
ALBUM_PATH = "/album/"
YANDEX_MUSIC_DOMAIN = "music.yandex.ru"
USER_NOT_FOUND = "Юзер не найден"
ORDER_PLAYS_DESC = "plays DESC"
SCDN_CO = "scdn.co"
YANDEX_AVATARS = "avatars.yandex.net"
TEXT_KEY = "#text"
USER_AGENT_MOZILLA = "Mozilla/5.0"
import httpx
import time
import uuid

from app.core.websockets import manager

from app.database import get_db, SessionLocal
from app.models import User, Achievement, UserAchievement, Follow, Scrobble, Track, ScrobbleLike, ScrobbleComment, UserProfile, UserIntegration
from app.schemas import FollowAction, LikeRequest, CommentRequest
from app.services.scrobble_processor import format_history_item
from app.services.og_parser import parse_og_meta
from app.utils import sanitize_text

# --- Missing constants & globals ---
import os
# Constants removed in favor of User.role
LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/"
IMPORTING_USERS = set()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

CACHE = {}
MAX_CACHE_SIZE = 500

def get_from_cache(key: str, ttl: int = 300):
    if key in CACHE:
        entry = CACHE[key]
        if time.time() - entry['ts'] < ttl:
            return entry['data']
        else:
            del CACHE[key]
    return None

def set_to_cache(key: str, data: any):
    now = time.time()
    if len(CACHE) >= MAX_CACHE_SIZE:
        expired_keys = [k for k, v in CACHE.items() if now - v['ts'] >= 300]
        for k in expired_keys:
            del CACHE[k]
        if len(CACHE) >= MAX_CACHE_SIZE:
            oldest_key = min(CACHE.keys(), key=lambda k: CACHE[k]['ts'])
            del CACHE[oldest_key]
    CACHE[key] = {'data': data, 'ts': now}

def get_active_streak(user: User):
    if not user.integration.last_streak_date: return 0
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday_str = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    if user.integration.last_streak_date in [today_str, yesterday_str]:
        return user.integration.current_streak or 0
    return 0

def get_user_timezone_offset(location: str) -> int:
    if not location: return 3
    loc = location.lower()
    mappings = {
        ("москва", "moscow", "санкт", "питер", "россия", "russia"): 3,
        ("калининград",): 2,
        ("самара",): 4,
        ("екатеринбург",): 5,
        ("омск",): 6,
        ("новосибирск", "красноярск"): 7,
        ("иркутск",): 8,
        ("якутск",): 9,
        ("владивосток",): 10,
        ("магадан",): 11,
        ("камчатка", "анадырь"): 12,
        ("лондон", "london", "uk"): 0,
        ("германия", "germany", "берлин", "paris", "франция"): 1
    }
    for keys, offset in mappings.items():
        if any(k in loc for k in keys):
            return offset
    return 3

def _check_total_scrobbles(user, ach, db: Session) -> bool:
    return db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).count() >= ach.rule_value

def _check_night_scrobbles(user, ach, db: Session) -> bool:
    valid_times = db.query(Scrobble.played_at).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).all()
    offset = get_user_timezone_offset(user.profile.location if user.profile else None)
    night_count = sum(1 for (dt,) in valid_times if (dt + timedelta(hours=offset)).strftime('%H') in ['00', '01', '02', '03', '04', '05'])
    return night_count >= ach.rule_value

def _scrobble_count_for_parts(db, user_id, parts):
    if len(parts) >= 2:
        return db.query(Scrobble).join(Track).filter(
            Scrobble.user_id == user_id,
            Scrobble.listened_sec * 100 >= Track.duration * 85,
            (Track.artist.ilike(f"%{parts[0]}%") & Track.title.ilike(f"%{parts[-1]}%"))
            | (Track.title.ilike(f"%{parts[0]}%") & Track.title.ilike(f"%{parts[-1]}%"))
        ).count()
    return db.query(Scrobble).join(Track).filter(
        Scrobble.user_id == user_id,
        Scrobble.listened_sec * 100 >= Track.duration * 85,
        (Track.title.ilike(f"%{parts[0]}%")) | (Track.artist.ilike(f"%{parts[0]}%"))
    ).count()


def _count_by_url(db, user_id, target_str):
    if "yandex.ru" in target_str and TRACK_PATH in target_str:
        track_id = target_str.split(TRACK_PATH)[1].strip("/")
        return db.query(Scrobble).join(Track).filter(
            Scrobble.user_id == user_id,
            Scrobble.listened_sec * 100 >= Track.duration * 85,
            Track.track_url.like(f"%/track/{track_id}%")
        ).count()
    return db.query(Scrobble).join(Track).filter(
        Scrobble.user_id == user_id,
        Scrobble.listened_sec * 100 >= Track.duration * 85,
        Track.track_url.like(f"%{target_str}%")
    ).count()


def _check_specific_track(user, ach, db: Session) -> bool:
    if not ach.rule_target:
        return False
    if ach.rule_target.startswith("http"):
        if hasattr(ach, 'rule_meta') and ach.rule_meta:
            parts = [p.strip() for p in ach.rule_meta.replace('—', '-').split('-')]
            count = _scrobble_count_for_parts(db, user.id, parts)
        else:
            count = _count_by_url(db, user.id, ach.rule_target.split('?')[0])
    else:
        parts = [p.strip() for p in ach.rule_target.replace('—', '-').split('-')]
        target0 = ach.rule_target.split("||")[0] if "||" in ach.rule_target else ach.rule_target
        if len(parts) >= 2:
            count = _scrobble_count_for_parts(db, user.id, parts)
        else:
            count = db.query(Scrobble).join(Track).filter(
                Scrobble.user_id == user.id,
                Scrobble.listened_sec * 100 >= Track.duration * 85,
                (Track.title.ilike(f"%{ach.rule_target}%")) | (Track.artist.ilike(f'%{target0}%'))
            ).count()
    return count >= ach.rule_value

def _check_specific_album(user, ach, db: Session) -> bool:
    if not ach.rule_target: return False
    if ach.target_image and (YANDEX_AVATARS in ach.target_image or SCDN_CO in ach.target_image):
        count = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.cover_url == ach.target_image).scalar() or 0
    else:
        clean_target = ach.rule_target.split('?')[0]
        count = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.track_url.like(f"%{clean_target}%")).scalar() or 0
    return count >= ach.rule_value

def _check_specific_artist(user, ach, db: Session) -> bool:
    if not ach.rule_target: return False
    target = ach.rule_target.split("||")[0] if "||" in ach.rule_target else ach.rule_target
    count = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.artist.ilike(f'%{target}%')).count()
    return count >= ach.rule_value

def check_auto_achievements(user, db: Session):
    auto_achs = db.query(Achievement).filter(Achievement.rule_type != "manual").all()
    if not auto_achs: return
    user_ach_ids = {ua.achievement_id for ua in db.query(UserAchievement).filter_by(user_id=user.id).all()}
    
    checkers = {
        "total_scrobbles": _check_total_scrobbles,
        "night_scrobbles": _check_night_scrobbles,
        "specific_track": _check_specific_track,
        "specific_album": _check_specific_album,
        "specific_artist": _check_specific_artist
    }
    
    for ach in auto_achs:
        if ach.id in user_ach_ids: continue 
        checker = checkers.get(ach.rule_type)
        if checker and checker(user, ach, db):
            db.add(UserAchievement(user_id=user.id, achievement_id=ach.id))
            user.integration.bonus_xp = (user.integration.bonus_xp or 0) + (ach.reward_xp or 0)
            db.commit()

def run_check_achievements_bg(user_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            check_auto_achievements(user, db)
    finally:
        db.close()

def get_user_level_info(user: User, db: Session):
    streak = get_active_streak(user)
    scrobbles_xp = db.query(func.sum(Scrobble.xp_earned)).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85).scalar() or 0
    base_xp = scrobbles_xp + (user.integration.bonus_xp or 0)
    total_xp = int(base_xp * 1.1) if streak >= 7 else base_xp
    level = (total_xp // 100) + 1
    if level >= 100: rank = "Божество"
    elif level >= 50: rank = "Легенда"
    elif level >= 30: rank = "Маньяк"
    elif level >= 15: rank = "Аудиофил"
    elif level >= 5: rank = "Меломан"
    else: rank = "Турист"
    return level, rank, total_xp, user.profile.theme

# Dummy taste match internal to prevent undefined errors
def get_taste_match_internal(viewer, profile, db):
    viewer_user = db.query(User).filter(User.username == viewer).first()
    profile_user = db.query(User).filter(User.username == profile).first()
    if not viewer_user or not profile_user or viewer == profile:
        return {"match": 0, "common_artists": []}
    sql = text("""
        SELECT DISTINCT t.artist 
        FROM scrobbles s JOIN tracks t ON s.track_id = t.id 
        WHERE s.user_id = :u1 AND s.listened_sec * 100 >= t.duration * 85
        INTERSECT
        SELECT DISTINCT t.artist 
        FROM scrobbles s JOIN tracks t ON s.track_id = t.id 
        WHERE s.user_id = :u2 AND s.listened_sec * 100 >= t.duration * 85
    """)
    common_rows = db.execute(sql, {"u1": viewer_user.id, "u2": profile_user.id}).fetchall()
    common_artists = list(set([a.strip() for row in common_rows for a in row[0].split(',')]))
    sql_total = text("""
        SELECT COUNT(DISTINCT t.artist) 
        FROM scrobbles s JOIN tracks t ON s.track_id = t.id 
        WHERE (s.user_id = :u1 OR s.user_id = :u2) AND s.listened_sec * 100 >= t.duration * 85
    """)
    total_unique = db.execute(sql_total, {"u1": viewer_user.id, "u2": profile_user.id}).scalar() or 1
    match_percent = int((len(common_artists) / total_unique) * 100)
    return {"match": min(match_percent, 100), "common_artists": common_artists[:5]}


# sanitize_text imported from app.utils

def get_taste_twins(username: str, db: Session):
    me = db.query(User).filter(User.username == username).first()
    if not me: return []
    
    sql = text("""
        SELECT u.id, u.username, p.display_name, p.avatar_url, COUNT(DISTINCT t.artist) as common_count
        FROM users u
        JOIN user_profiles p ON u.id = p.user_id
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
        GROUP BY u.id, u.username, p.display_name, p.avatar_url
        HAVING COUNT(DISTINCT t.artist) > 0
        ORDER BY common_count DESC
        LIMIT 10
    """)
    
    rows = db.execute(sql, {"my_id": me.id}).fetchall()
    if not rows: return []
    
    my_artist_count = db.query(func.count(func.distinct(Track.artist))).join(Scrobble).filter(Scrobble.user_id == me.id, Scrobble.listened_sec * 100 >= Track.duration * 85).scalar() or 1
    
    results = []
    for row in rows:
        uid, uname, dname, avatar, common = row
        match = int((common / my_artist_count) * 100)
        
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
    return results



router = APIRouter(tags=["extended"])



# --- /api/user/mood ---
@router.get("/api/user/mood", responses={404: {"description": "User not found"}})
def get_user_mood(username: str, db: Annotated[Session, Depends(get_db)]):
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


# --- /api/user/{username} ---
@router.get("/api/user/{username}", responses={404: {"description": "User not found"}})
def get_user_info(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404, USER_NOT_FOUND)
    role = user.role or "user"

    # Privacy check for profile data using get_current_user securely
    current_u = None
    try:
        current_u = get_current_user(request, db)
    except Exception:
        pass
    is_owner = current_u and current_u.id == user.id
    
    if user.profile.is_private and not is_owner:
        return {
            "username": user.username, "display_name": user.profile.display_name or user.username,
            "avatar_url": user.profile.avatar_url, "is_private": True, "role": role
        }

    ach_data = db.query(Achievement, UserAchievement).join(UserAchievement, Achievement.id == UserAchievement.achievement_id).filter(UserAchievement.user_id == user.id).all()
    return {
        "username": user.username, "display_name": user.profile.display_name or user.username, "bio": user.profile.bio or "Этот пользователь пока ничего о себе не рассказал.",
        "avatar_url": user.profile.avatar_url, "cover_url": user.profile.cover_url, "location": user.profile.location, "favorite_genre": user.profile.favorite_genre, "equipment": user.profile.equipment,
        "social_links": user.profile.social_links or "[]", "theme": user.profile.theme or "classic", "is_verified": user.integration.is_verified,
        "favorite_artist": user.profile.favorite_artist, "favorite_artist_url": user.profile.favorite_artist_url, "favorite_artist_cover": user.profile.favorite_artist_cover,
        "favorite_track": user.profile.favorite_track, "favorite_track_url": user.profile.favorite_track_url, "favorite_track_cover": user.profile.favorite_track_cover, 
        "favorite_album": user.profile.favorite_album, "favorite_album_url": user.profile.favorite_album_url, "favorite_album_cover": user.profile.favorite_album_cover,
        "spotify_linked": bool(user.integration.spotify_refresh_token), "yandex_linked": bool(user.integration.yandex_token),
        "lastfm_username": user.integration.lastfm_username, "last_sync": user.integration.last_sync, "role": role,
        "achievements": [{"id": a.id, "name": a.name, "description": a.description, "icon": a.icon, "target_image": a.target_image, "reward_xp": a.reward_xp, "is_displayed": ua.is_displayed, "earned_at": ua.earned_at} for a, ua in ach_data],
        "streak": get_active_streak(user),
        "has_api_key": bool(user.api_key) if is_owner else False
    }


# --- /api/taste-match/{viewer}/{profile} ---
@router.get("/api/taste-match/{viewer}/{profile}")
def get_taste_match(viewer: str, profile: str, db: Annotated[Session, Depends(get_db)]):
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


# --- /api/notifications/{username} ---
@router.get("/api/notifications/{username}")
def get_notifications(username: str, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user: return []
    new_achs = db.query(Achievement, UserAchievement).join(UserAchievement).filter(UserAchievement.user_id == user.id, UserAchievement.notified == False).all()
    return [{"ua_id": ua.id, "name": a.name, "icon": a.icon, "reward_xp": a.reward_xp, "target_image": a.target_image} for a, ua in new_achs]


# --- /api/achievements/all/{username} ---
@router.get("/api/achievements/all/{username}", responses={404: {"description": "User not found"}})
def get_all_achievements(username: str, db: Annotated[Session, Depends(get_db)]): # NOSONAR
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
                        parts = [p.strip() for p in a.rule_meta.replace('—', '-').split('-')]
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
                        if "yandex.ru" in target_str and TRACK_PATH in target_str:
                            track_id = target_str.split(TRACK_PATH)[1].strip("/")
                            current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.track_url.like(f"%/track/{track_id}%")).count()
                        else: current_val = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85, Track.track_url.like(f"%/track/{target_str}%")).count()
                else:
                    parts = [p.strip() for p in a.rule_target.replace('—', '-').split('-')]
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
                    parts = [p.strip() for p in album_name.replace('—', '-').split('-')]
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

    return {"user": {"username": user.username, "display_name": user.profile.display_name or user.username, "avatar_url": user.profile.avatar_url}, "achievements": res, "earned_count": len(user_achs), "total_count": len(all_achs)}


# --- /api/recommendations ---
@router.get("/api/recommendations")
def get_recommendations(username: str, db: Annotated[Session, Depends(get_db)]):
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


# --- /api/stats/wrapped ---
@router.get("/api/stats/wrapped")
def get_wrapped_stats(username: str, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    last_month = datetime.now(timezone.utc) - timedelta(days=30)
    base_filter = [Scrobble.user_id == user.id, Scrobble.played_at >= last_month, Scrobble.listened_sec * 100 >= Track.duration * 85]
    top_artist = db.query(Track.artist, func.count(Scrobble.id)).join(Scrobble).filter(*base_filter).group_by(Track.artist).order_by(text('count_1 DESC')).first()
    total_min = db.query(func.sum(Scrobble.listened_sec)).join(Track).filter(*base_filter).scalar() or 0
    return {
        "period": "За последние 30 дней",
        "top_artist": top_artist[0] if top_artist else "Нет данных",
        "total_minutes": int(total_min // 60),
        "status": "Legendary" if total_min > 5000 else "Active"
    }





# --- /api/search/taste ---
@router.get("/api/search/taste")
def search_by_taste(my_username: str, db: Annotated[Session, Depends(get_db)]):
    # Find people with highest taste match
    all_users = db.query(User).filter(User.username != my_username).limit(50).all()
    results = []
    for u in all_users:
        match_data = get_taste_match_internal(my_username, u.username, db)
        if match_data and match_data['match'] > 50:
            results.append({
                "username": u.username,
                "display_name": u.profile.display_name or u.username,
                "avatar_url": u.profile.avatar_url,
                "match": match_data['match']
            })
    results.sort(key=lambda x: x['match'], reverse=True)
    return results[:10]


# --- /api/feed/global ---
@router.get("/api/feed/global")
def get_global_feed(db: Annotated[Session, Depends(get_db)]):
    # Latest scrobbles from public users
    scrobbles = db.query(Scrobble).join(User).join(UserProfile).filter(UserProfile.is_private == False).order_by(Scrobble.id.desc()).limit(20).all()
    return {"feed": [format_history_item(s, s.track) for s in scrobbles]}


def _get_activity_stats(db: Session, base_filter) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    try:
        is_postgres = db.get_bind().dialect.name == "postgresql"
    except Exception:
        is_postgres = True
        
    if is_postgres:
        hours_raw = db.query(func.to_char(Scrobble.played_at, 'HH24'), func.count(Scrobble.id)).join(Track).filter(*base_filter).group_by(func.to_char(Scrobble.played_at, 'HH24')).all()
        days_raw = db.query(func.to_char(Scrobble.played_at, 'ID'), func.count(Scrobble.id)).join(Track).filter(*base_filter).group_by(func.to_char(Scrobble.played_at, 'ID')).all()
        graph_raw = db.query(func.to_char(Scrobble.played_at, 'YYYY-MM-DD'), func.count(Scrobble.id)).join(Track).filter(*base_filter).group_by(func.to_char(Scrobble.played_at, 'YYYY-MM-DD')).all()
        day_names = {'1': 'Пн', '2': 'Вт', '3': 'Ср', '4': 'Чт', '5': 'Пт', '6': 'Сб', '7': 'Вс'}
    else:
        hours_raw = db.query(func.strftime('%H', Scrobble.played_at), func.count(Scrobble.id)).join(Track).filter(*base_filter).group_by(func.strftime('%H', Scrobble.played_at)).all()
        days_raw = db.query(func.strftime('%w', Scrobble.played_at), func.count(Scrobble.id)).join(Track).filter(*base_filter).group_by(func.strftime('%w', Scrobble.played_at)).all()
        graph_raw = db.query(func.strftime('%Y-%m-%d', Scrobble.played_at), func.count(Scrobble.id)).join(Track).filter(*base_filter).group_by(func.strftime('%Y-%m-%d', Scrobble.played_at)).all()
        day_names = {'1': 'Пн', '2': 'Вт', '3': 'Ср', '4': 'Чт', '5': 'Пт', '6': 'Сб', '0': 'Вс'}
        
    hours_activity = {f"{i:02d}": 0 for i in range(24)}
    for h, count in hours_raw:
        if h is not None:
            hours_activity[h] = count

    days_activity = dict.fromkeys(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], 0)
    for d, count in days_raw:
        if d in day_names:
            days_activity[day_names[d]] = count

    activity_graph = {date: count for date, count in graph_raw if date is not None}
    return hours_activity, days_activity, activity_graph


# --- /api/detailed-stats/{username} ---
@router.get("/api/detailed-stats/{username}")
def get_detailed_stats(username: str, db: Annotated[Session, Depends(get_db)], period: str = "all"):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    
    base_filter = [Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= Track.duration * 85]
    if period == "7d":
        base_filter.append(Scrobble.played_at >= datetime.now(timezone.utc) - timedelta(days=7))
    elif period == "30d":
        base_filter.append(Scrobble.played_at >= datetime.now(timezone.utc) - timedelta(days=30))
        
    # 1. General Stats
    total_scrobbles = db.query(func.count(Scrobble.id)).join(Track).filter(*base_filter).scalar() or 0
    total_sec = db.query(func.sum(Scrobble.listened_sec)).join(Track).filter(*base_filter).scalar() or 0
    unique_artists = db.query(func.count(func.distinct(Track.artist))).join(Scrobble).filter(*base_filter).scalar() or 0
    unique_tracks = db.query(func.count(func.distinct(Track.id))).join(Scrobble).filter(*base_filter).scalar() or 0
    
    # 2. Top Artists
    top_artists_raw = db.query(Track.artist, func.count(Scrobble.id).label('plays'), func.max(Scrobble.source).label('source'))\
        .join(Scrobble).filter(*base_filter).group_by(Track.artist)\
        .order_by(text(ORDER_PLAYS_DESC)).limit(10).all()
    
    # 3. Top Tracks
    top_tracks_raw = db.query(Track.title, Track.artist, Track.cover_url, Track.track_url, func.count(Scrobble.id).label('plays'), func.max(Scrobble.source).label('source'))\
        .join(Scrobble).filter(*base_filter).group_by(Track.id, Track.title, Track.artist, Track.cover_url, Track.track_url)\
        .order_by(text(ORDER_PLAYS_DESC)).limit(10).all()
        
    # 4. Top Albums
    top_albums_raw = db.query(Track.album, Track.artist, Track.cover_url, func.count(Scrobble.id).label('plays'), func.max(Scrobble.source).label('source'))\
        .join(Scrobble).filter(*base_filter, Track.album != None)\
        .group_by(Track.album, Track.artist, Track.cover_url)\
        .order_by(text(ORDER_PLAYS_DESC)).limit(10).all()

    # 5. Genre & Source counts
    genres = db.query(Track.genre, func.count(Scrobble.id)).join(Scrobble).filter(*base_filter, Track.genre != None).group_by(Track.genre).all()
    sources = db.query(Scrobble.source, func.count(Scrobble.id)).join(Track).filter(*base_filter).group_by(Scrobble.source).all()
    
    # 6. Activity
    hours_activity, days_activity, activity_graph = _get_activity_stats(db, base_filter)

    return {
        "user": {"username": user.username, "display_name": user.profile.display_name or user.username, "avatar_url": user.profile.avatar_url},
        "total_time_min": int(total_sec // 60),
        "total_scrobbles": total_scrobbles,
        "unique_artists": unique_artists,
        "unique_tracks": unique_tracks,
        "top_artists": [{"name": r[0], "plays": r[1], "source": r[2]} for r in top_artists_raw],
        "top_tracks": [{"title": r[0], "artist": r[1], "cover_url": r[2], "track_url": r[3], "plays": r[4], "source": r[5]} for r in top_tracks_raw],
        "top_albums": [{"album": r[0], "artist": r[1], "cover_url": r[2], "plays": r[3], "source": r[4]} for r in top_albums_raw],
        "genre_counts": dict(genres),
        "source_counts": dict(sources),
        "activity_graph": activity_graph,
        "hours_activity": hours_activity,
        "days_activity": days_activity
    }

# --- /api/stats/{username} ---
@router.get("/api/stats/{username}")
def get_stats(username: str, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    streak = get_active_streak(user)
    
    scrobbles = db.query(Scrobble, Track).join(Track).filter(
        Scrobble.user_id == user.id, 
        Scrobble.listened_sec * 100 >= Track.duration * 85
    ).all()
    
    total_scrobbles = len(scrobbles)
    scrobbles_xp = sum(s.xp_earned for s, t in scrobbles)
    base_xp = scrobbles_xp + (user.integration.bonus_xp or 0)
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


# --- /api/activity/{username} ---
@router.get("/api/activity/{username}")
def get_activity(username: str, db: Annotated[Session, Depends(get_db)]):
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


# --- /api/current-track/{username} ---
@router.get("/api/current-track/{username}")
def get_current_track(username: str, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return {"playing": False}
        
    last_scrobble = db.query(Scrobble, Track).join(Track).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).first()
    
    if not last_scrobble:
        return {"playing": False}
        
    s, t = last_scrobble
    is_active = s.is_playing and (datetime.now(timezone.utc) - (s.updated_at or s.played_at)).total_seconds() < 900
    
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



# --- /api/scrobble/{scrobble_id}/comments ---
@router.get("/api/scrobble/{scrobble_id}/comments")
def get_comments(scrobble_id: int, db: Annotated[Session, Depends(get_db)]):
    comments = db.query(ScrobbleComment, User.username, UserProfile.avatar_url).join(User, ScrobbleComment.user_id == User.id).join(UserProfile, User.id == UserProfile.user_id).filter(ScrobbleComment.scrobble_id == scrobble_id).all()
    return [{"id": c.ScrobbleComment.id, "content": c.ScrobbleComment.content, "username": c.username, "avatar_url": c.avatar_url, "created_at": c.ScrobbleComment.created_at} for c in comments]


# --- /api/follow-stats/{viewer}/{profile} ---
@router.get("/api/follow-stats/{viewer}/{profile}")
def get_follow_stats(viewer: str, profile: str, db: Annotated[Session, Depends(get_db)]):
    target = db.query(User).filter(User.username == profile).first()
    if not target: raise HTTPException(404)
    followers_count = db.query(Follow).filter(Follow.following_id == target.id).count()
    following_count = db.query(Follow).filter(Follow.follower_id == target.id).count()
    is_following = False
    if viewer != 'null':
        viewer_user = db.query(User).filter(User.username == viewer).first()
        if viewer_user: is_following = db.query(Follow).filter(Follow.follower_id == viewer_user.id, Follow.following_id == target.id).first() is not None
    return {"followers": followers_count, "following": following_count, "is_following": is_following}

@router.get("/api/follow-stats/{profile}")
def get_follow_stats_fallback(profile: str, db: Annotated[Session, Depends(get_db)]):
    return get_follow_stats("null", profile, db)


# --- /api/followers/{username} ---
@router.get("/api/followers/{username}")
def get_followers(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    target = db.query(User).filter(User.username == username).first()
    if not target: raise HTTPException(404)
    
    # Privacy check
    api_key = request.query_params.get("api_key")
    is_owner = api_key and target.api_key == api_key
    if target.profile.is_private and not is_owner:
        return []

    followers = db.query(User).join(Follow, Follow.follower_id == User.id).filter(Follow.following_id == target.id).all()
    res = []
    for u in followers:
        lvl, rank, _, theme = get_user_level_info(u, db)
        res.append({"username": u.username, "display_name": u.profile.display_name or u.username, "avatar_url": u.profile.avatar_url, "is_verified": u.integration.is_verified, "role": u.role or "user", "level": lvl})
    return res


# --- /api/following/{username} ---
@router.get("/api/following/{username}")
def get_following(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    target = db.query(User).filter(User.username == username).first()
    if not target: raise HTTPException(404)

    # Privacy check
    api_key = request.query_params.get("api_key")
    is_owner = api_key and target.api_key == api_key
    if target.profile.is_private and not is_owner:
        return []

    following = db.query(User).join(Follow, Follow.following_id == User.id).filter(Follow.follower_id == target.id).all()
    res = []
    for u in following:
        lvl, rank, _, theme = get_user_level_info(u, db)
        res.append({"username": u.username, "display_name": u.profile.display_name or u.username, "avatar_url": u.profile.avatar_url, "is_verified": u.integration.is_verified, "role": u.role or "user", "level": lvl})
    return res


# --- /api/leaderboard ---
@router.get("/api/leaderboard")
def get_leaderboard(db: Annotated[Session, Depends(get_db)]):
    # Calculate XP for all users in one query
    sql = text("""
        SELECT u.username, p.display_name, p.avatar_url, i.is_verified, p.theme,
               (COALESCE(SUM(s.xp_earned), 0) + i.bonus_xp) as total_xp, u.role
        FROM users u
        JOIN user_profiles p ON u.id = p.user_id
        JOIN user_integrations i ON u.id = i.user_id
        LEFT JOIN scrobbles s ON u.id = s.user_id
        GROUP BY u.id, p.display_name, p.avatar_url, i.is_verified, p.theme, i.bonus_xp, u.role
        ORDER BY total_xp DESC
        LIMIT 50
    """)
    
    rows = db.execute(sql).fetchall()
    res = []
    for r in rows:
        uname, dname, avatar, verified, theme, txp, urole = r
        lvl = (txp // 100) + 1
        res.append({
            "username": uname,
            "display_name": dname or uname,
            "avatar_url": avatar,
            "total_xp": txp,
            "level": lvl,
            "is_verified": verified,
            "role": urole or "user",
            "theme": theme
        })
    return res


# --- /api/redirect ---
@router.get("/api/redirect")
async def smart_redirect(source: str, type: str, q: str):
    if source == "yandex":
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"https://api.music.yandex.net/search?text={urllib.parse.quote(q)}&type=all&page=0", headers={'User-Agent': USER_AGENT_MOZILLA}, timeout=5)
                if resp.status_code == 200:
                    res = resp.json().get("result", {})
                    if type == "artist":
                        items = res.get("artists", {}).get("results", [])
                        if items: return RedirectResponse(url=f"https://{YANDEX_MUSIC_DOMAIN}/artist/{items[0]['id']}")
                    elif type == "album":
                        items = res.get("albums", {}).get("results", [])
                        if items: return RedirectResponse(url=f"https://{YANDEX_MUSIC_DOMAIN}/album/{items[0]['id']}")
                    elif type == "track":
                        items = res.get("tracks", {}).get("results", [])
                        if items:
                            alb_list = items[0].get("albums", [])
                            alb_id = alb_list[0].get("id") if alb_list else None
                            if alb_id: return RedirectResponse(url=f"https://{YANDEX_MUSIC_DOMAIN}/album/{alb_id}/track/{items[0]['id']}")
        except Exception as e:
            print(f"Redirect error: {e}")
        if type == "artist": return RedirectResponse(url=f"https://{YANDEX_MUSIC_DOMAIN}/search?text={urllib.parse.quote(q)}&type=artists")
        if type == "album": return RedirectResponse(url=f"https://{YANDEX_MUSIC_DOMAIN}/search?text={urllib.parse.quote(q)}&type=albums")
        if type == "track": return RedirectResponse(url=f"https://{YANDEX_MUSIC_DOMAIN}/search?text={urllib.parse.quote(q)}&type=tracks")
        
    return RedirectResponse(url=f"https://{YANDEX_MUSIC_DOMAIN}")


# --- /api/search/users ---
@router.get("/api/search/users")
def search_users(q: str, db: Annotated[Session, Depends(get_db)]):
    if not q or len(q) < 2: return []
    users = db.query(User).join(UserProfile).filter((User.username.ilike(f"%{q}%")) | (UserProfile.display_name.ilike(f"%{q}%"))).limit(10).all()
    res = []
    for u in users:
        lvl, rank, _, theme = get_user_level_info(u, db)
        res.append({"username": u.username, "display_name": u.profile.display_name or u.username, "avatar_url": u.profile.avatar_url, "is_verified": u.integration.is_verified, "role": u.role or "user", "level": lvl})
    return res

# Removed duplicate get_admin_stats endpoint


# --- /api/public-stats ---
@router.get("/api/public-stats")
def get_public_stats(db: Annotated[Session, Depends(get_db)]):
    total_users = db.query(User).count()
    total_scrobbles = db.query(Scrobble).join(Track).filter(Scrobble.listened_sec * 100 >= Track.duration * 85).count()
    total_tracks = db.query(Track).count()
    
    # Считаем онлайн за последние 5 минут
    five_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
    online_count = db.query(func.count(func.distinct(Scrobble.user_id))).filter(Scrobble.updated_at >= five_mins_ago).scalar() or 0
    
    return {"total_users": total_users, "total_scrobbles": total_scrobbles, "total_tracks": total_tracks, "online": online_count}


# --- /api/import/lastfm ---
@router.post("/api/import/lastfm")
async def start_lastfm_import(data: LikeRequest, background_tasks: BackgroundTasks, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    
    if user.id in IMPORTING_USERS: raise HTTPException(429, "Импорт уже запущен")
    if not user.integration.lastfm_username: raise HTTPException(400, "Last.fm username not set in profile")
    if not LASTFM_API_KEY: raise HTTPException(500, "Last.fm API key not configured on server")
    
    IMPORTING_USERS.add(user.id)
    background_tasks.add_task(import_lastfm_history, user.id, SessionLocal)
    return {"status": "import_started"}


# --- /api/integrations/yandex ---
@router.post("/api/integrations/yandex")
def update_yandex_token(data: dict, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    
    user.integration.yandex_token = data.get("token")
    db.commit()
    return {"status": "ok"}


# --- /api/integrations/spotify/disconnect ---
@router.post("/api/integrations/spotify/disconnect")
def disconnect_spotify(data: LikeRequest, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    
    user.integration.spotify_access_token = None
    user.integration.spotify_refresh_token = None
    db.commit()
    return {"status": "ok"}


# --- /api/integrations/yandex/disconnect ---
@router.post("/api/integrations/yandex/disconnect")
def disconnect_yandex(data: LikeRequest, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    
    user.integration.yandex_token = None
    db.commit()
    return {"status": "ok"}


# --- /api/integrations/lastfm/disconnect ---
@router.post("/api/integrations/lastfm/disconnect")
def disconnect_lastfm(data: LikeRequest, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    
    user.integration.lastfm_username = None
    db.commit()
    return {"status": "ok"}


# --- /api/scrobble/{scrobble_id}/like ---
@router.post("/api/scrobble/{scrobble_id}/like")
def toggle_like(scrobble_id: int, data: LikeRequest, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    
    like = db.query(ScrobbleLike).filter_by(user_id=user.id, scrobble_id=scrobble_id).first()
    if like:
        db.delete(like); db.commit()
        return {"status": "unliked"}
    else:
        db.add(ScrobbleLike(user_id=user.id, scrobble_id=scrobble_id)); db.commit()
        return {"status": "liked"}


# --- /api/scrobble/{scrobble_id}/comment ---
@router.post("/api/scrobble/{scrobble_id}/comment")
def add_comment(scrobble_id: int, data: CommentRequest, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    
    # Sanitize comment content to prevent XSS
    clean_content = sanitize_text(data.content)
    db.add(ScrobbleComment(user_id=user.id, scrobble_id=scrobble_id, content=clean_content))
    db.commit()
    return {"status": "ok"}


# --- /api/follow/{target_username} ---
@router.post("/api/follow/{target_username}")
def toggle_follow(target_username: str, data: FollowAction, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    follower = current_user
    target = db.query(User).filter(User.username == target_username).first()
    if not follower or not target or follower.id == target.id: raise HTTPException(400)
    existing = db.query(Follow).filter(Follow.follower_id == follower.id, Follow.following_id == target.id).first()
    if existing:
        db.delete(existing); db.commit()
        return {"status": "unfollowed"}
    else:
        db.add(Follow(follower_id=follower.id, following_id=target.id)); db.commit()
        return {"status": "followed"}


# --- POST /api/admin/achievements ---
@router.post("/api/admin/achievements")
async def create_achievement(data: AchCreate, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]): # NOSONAR
    target_val = data.rule_target
    val = data.rule_value
    t_img = data.target_image
    meta_text = data.rule_meta
    if data.rule_type in ["specific_track", "specific_album", "specific_artist"] and target_val and target_val.startswith("http"):
        if YANDEX_AVATARS not in target_val and SCDN_CO not in target_val:
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


# --- PUT /api/admin/achievements/{ach_id} ---
@router.put("/api/admin/achievements/{ach_id}")
async def update_achievement(ach_id: int, data: AchUpdate, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]): # NOSONAR
    ach = db.query(Achievement).filter(Achievement.id == ach_id).first()
    target_val = data.rule_target
    val = data.rule_value
    t_img = data.target_image
    meta_text = data.rule_meta
    if data.rule_type in ["specific_track", "specific_album", "specific_artist"] and target_val and target_val.startswith("http"):
        if YANDEX_AVATARS not in target_val and SCDN_CO not in target_val:
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


# --- DELETE /api/admin/achievements/{ach_id} ---
@router.delete("/api/admin/achievements/{ach_id}")
def delete_achievement(ach_id: int, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    db.query(UserAchievement).filter(UserAchievement.achievement_id == ach_id).delete()
    db.query(Achievement).filter(Achievement.id == ach_id).delete()
    db.commit()
    return {"status": "ok"}


# --- DELETE /api/admin/tracks/{track_id} ---
@router.delete("/api/admin/tracks/{track_id}")
def delete_track(track_id: int, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    db.query(Scrobble).filter(Scrobble.track_id == track_id).delete()
    db.query(Track).filter(Track.id == track_id).delete()
    db.commit()
    return {"status": "ok"}


# --- POST /api/admin/users/{target_username}/achievements ---
@router.post("/api/admin/users/{target_username}/achievements")
def assign_achievement(target_username: str, data: AchAssign, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    user = db.query(User).filter(User.username == target_username).first()
    if not db.query(UserAchievement).filter_by(user_id=user.id, achievement_id=data.achievement_id).first():
        ach = db.query(Achievement).filter_by(id=data.achievement_id).first()
        db.add(UserAchievement(user_id=user.id, achievement_id=data.achievement_id))
        user.integration.bonus_xp = (user.integration.bonus_xp or 0) + (ach.reward_xp or 0)
        db.commit()
    return {"status": "ok"}


# --- DELETE /api/admin/users/{target_username}/achievements/{achievement_id} ---
@router.delete("/api/admin/users/{target_username}/achievements/{achievement_id}", responses={404: {"description": "User not found"}})
def remove_achievement_from_user(target_username: str, achievement_id: int, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    target = db.query(User).filter(User.username == target_username).first()
    if not target: raise HTTPException(404, USER_NOT_FOUND)
    ua = db.query(UserAchievement).filter_by(user_id=target.id, achievement_id=achievement_id).first()
    if ua:
        ach = db.query(Achievement).filter_by(id=achievement_id).first()
        if ach: target.integration.bonus_xp = (target.integration.bonus_xp or 0) - (ach.reward_xp or 0)
        db.delete(ua)
        db.commit()
    return {"status": "ok"}


# --- POST /api/admin/users/{target_username}/level ---
@router.post("/api/admin/users/{target_username}/level", responses={404: {"description": "User not found"}, 400: {"description": "Invalid level"}})
def update_user_level(target_username: str, data: LevelUpdate, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    target = db.query(User).filter(User.username == target_username).first()
    if not target: raise HTTPException(404, USER_NOT_FOUND)
    if data.new_level <= 0 or data.new_level > 10000:
        raise HTTPException(status_code=400, detail="Уровень должен быть от 1 до 10000")
    count_scrobbles = db.query(Scrobble).join(Track).filter(Scrobble.user_id == target.id, Scrobble.listened_sec * 100 >= Track.duration * 85).count()
    target.integration.bonus_xp = max(0, ((data.new_level - 1) * 100) - count_scrobbles)
    db.commit()
    return {"status": "ok"}


# --- DELETE /api/admin/users/{target_username}/scrobbles ---
@router.delete("/api/admin/users/{target_username}/scrobbles")
def wipe_user_scrobbles(target_username: str, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    target = db.query(User).filter(User.username == target_username).first()
    if not target: raise HTTPException(404)
    db.query(Scrobble).filter(Scrobble.user_id == target.id).delete()
    db.commit()
    return {"status": "ok"}


# --- GET /api/error/rate-limited ---
@router.get("/api/error/rate-limited")
def rate_limited(): return JSONResponse(status_code=429, content={"error": "Too many requests. Please wait a minute."})


# --- POST /api/notifications/{username}/read ---
@router.post("/api/notifications/{username}/read")
def mark_notifications_read(username: str, data: MarkRead, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    if current_user.username != username: raise HTTPException(403)
    user = db.query(User).filter(User.username == username).first()
    if not user: return {"status": "error"}
    db.query(UserAchievement).filter(UserAchievement.id.in_(data.ua_ids), UserAchievement.user_id == user.id).update({"notified": True}, synchronize_session=False)
    db.commit()
    return {"status": "ok"}


# --- POST /api/profile/achievements/toggle ---
@router.post("/api/profile/achievements/toggle")
def toggle_achievement(data: ToggleAch, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    
    ua = db.query(UserAchievement).filter_by(user_id=user.id, achievement_id=data.achievement_id).first()
    if not ua: raise HTTPException(404)
    ua.is_displayed = not ua.is_displayed
    db.commit()
    return {"status": "ok", "is_displayed": ua.is_displayed}


def _save_file_sync(file_path: str, content: bytes):
    with open(file_path, "wb") as buffer:
        buffer.write(content)


# --- POST /api/upload ---
@router.post("/api/upload")
async def upload_file(current_user: Annotated[User, Depends(get_current_user)], file: Annotated[UploadFile, File()]):
    import anyio
    # Security: Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Только изображения (JPG, PNG, WEBP, GIF)")

    # Security: Validate file size (max 5MB)
    MAX_SIZE = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "Файл слишком большой (макс. 5МБ)")
    
    mime_to_ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif"
    }
    ext = mime_to_ext.get(file.content_type, "jpg")
    filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(UPLOADS_DIR, filename)
    await anyio.to_thread.run_sync(_save_file_sync, file_path, content)
    return {"url": f"{API_BASE_URL}/uploads/{filename}"}


# --- GET /uploads/{filename} ---
@router.get("/uploads/{filename}", responses={400: {"description": "Invalid path"}, 404: {"description": "File not found"}})
async def get_upload(filename: str, current_user: Annotated[User, Depends(get_current_user)]):
    clean_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOADS_DIR, clean_filename)
    # Path traversal protection
    real_path = os.path.abspath(file_path)
    real_uploads_dir = os.path.abspath(UPLOADS_DIR)
    if not real_path.startswith(real_uploads_dir):
        raise HTTPException(status_code=400, detail="Invalid path")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Файл не найден")



async def get_album_track_count(url: str) -> int:
    if not url or not url.startswith("http"): return 0
    headers = {'User-Agent': USER_AGENT_MOZILLA}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
            if YANDEX_MUSIC_DOMAIN in url and ALBUM_PATH in url:
                  album_id = url.split(ALBUM_PATH)[1].split('/')[0].split('?')[0]
                  res = (await client.get(f"https://{YANDEX_MUSIC_DOMAIN}/handlers/album.jsx?album={album_id}")).json()
                  return res.get("trackCount", 0)
            elif "spotify.com" in url and ALBUM_PATH in url:
                  resp = await client.get(url)
                  match = re.search(r'music:song_count["\']\s+content=["\'](\d+)["\']', resp.text, re.IGNORECASE)
                  if match: return int(match.group(1))
    except Exception as e:
        print(f"Album track count error: {e}")
    return 0



async def import_lastfm_history(user_id: int, db_session_factory):
    db = db_session_factory()
    imported_count = 0
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"Import Error: User {user_id} not found")
            return
        if not user.integration.lastfm_username:
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
                    "user": user.integration.lastfm_username,
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
                    artist = t.get("artist", {}).get(TEXT_KEY)
                    album = t.get("album", {}).get(TEXT_KEY)
                    cover = t.get("image", [{}, {}, {}, {TEXT_KEY: ""}])[3].get(TEXT_KEY)
                    uts = int(t.get("date", {}).get("uts", 0))
                    dt = datetime.fromtimestamp(uts, tz=timezone.utc)
                    
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
        await manager.broadcast_to_user(user.username, {"type": "IMPORT_FINISHED", "message": f"✅ Импорт завершен! Добавлено {imported_count} треков."})
        
    except Exception as e:
        print(f"Last.fm Import Logic Error: {e}")
    finally:
        IMPORTING_USERS.discard(user_id)
        db.close()
