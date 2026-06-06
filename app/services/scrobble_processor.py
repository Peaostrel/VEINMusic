from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
import httpx
from typing import Optional

from app.models import User, Track, Scrobble, ScrobbleLike, ScrobbleComment
from app.core.websockets import manager

TRACK_PATH = "/track/"

async def get_track_duration(url: str) -> int:
    if not url or not url.startswith("http"): return 180 
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
            if "music.yandex.ru" in url and TRACK_PATH in url:
                track_id = url.split('/track/')[1].split('/')[0].split('?')[0]
                res = (await client.get(f"https://music.yandex.ru/handlers/track.jsx?track={track_id}")).json()
                return int(res.get("track", {}).get("durationMs", 180000) / 1000)
    except Exception as e:
        print(f"Duration fetch error: {e}")
    return 180

async def get_track_genre(url: str) -> Optional[str]:
    if not url or not url.startswith("http"): return None
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
            if "music.yandex.ru" in url:
                if TRACK_PATH in url:
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

def format_history_item(scrobble, track, db: Session = None, counters: dict = None):
    upd_time = scrobble.updated_at or scrobble.played_at
    if upd_time.tzinfo is None:
        upd_time = upd_time.replace(tzinfo=timezone.utc)
    
    played_time = scrobble.played_at
    if played_time.tzinfo is None:
        played_time = played_time.replace(tzinfo=timezone.utc)
        
    now = datetime.now(timezone.utc)
    is_playing = scrobble.is_playing and (now - upd_time).total_seconds() < 45
    
    diff = now - played_time
    if diff.total_seconds() < 60:
        rel_time = "только что"
    elif diff.total_seconds() < 3600:
        rel_time = f"{int(diff.total_seconds() // 60)}м назад"
    elif diff.total_seconds() < 86400:
        rel_time = f"{int(diff.total_seconds() // 3600)}ч назад"
    else:
        rel_time = played_time.strftime("%d %b")

    data = {
        "id": scrobble.id,
        "username": scrobble.user.username if scrobble.user else None,
        "avatar_url": scrobble.user.profile.avatar_url if (scrobble.user and scrobble.user.profile) else None,
        "artist": track.artist, "title": track.title, "cover_url": track.cover_url,
        "track_url": track.track_url, "source": scrobble.source, "time": str(played_time),
        "relative_time": rel_time,
        "duration": track.duration, "listened_sec": scrobble.listened_sec,
        "is_playing": is_playing, "updated_at": str(upd_time),
        "is_imported": scrobble.is_imported
    }
    if counters:
        data["likes_count"] = counters.get(scrobble.id, {}).get("likes", 0)
        data["comments_count"] = counters.get(scrobble.id, {}).get("comments", 0)
    elif db:
        data["likes_count"] = db.query(ScrobbleLike).filter_by(scrobble_id=scrobble.id).count()
        data["comments_count"] = db.query(ScrobbleComment).filter_by(scrobble_id=scrobble.id).count()
    return data

def _update_existing_track(db: Session, track: Track, cover_url: str, track_url: str, duration: int, album: str) -> None:
    """Update mutable fields on an existing track and commit if anything changed."""
    updated = False
    if cover_url and not track.cover_url:
        track.cover_url = cover_url
        updated = True
    if track_url and TRACK_PATH in track_url:
        if not track.track_url or TRACK_PATH not in track.track_url:
            track.track_url = track_url
            updated = True
    if album and not track.album:
        track.album = album
        updated = True
    if duration and duration > 0:
        needs_update = track.duration == 0 or track.duration == 180 or abs(track.duration - duration) > 5
        if needs_update:
            track.duration = duration
            updated = True
    if updated:
        db.commit()


async def _get_or_create_track(db: Session, title: str, artist: str, cover_url: str, track_url: str, duration: int, album: str) -> Track:
    track = db.query(Track).filter(
        func.lower(Track.title) == func.lower(title),
        func.lower(Track.artist) == func.lower(artist)
    ).first()

    if not track:
        track = Track(title=title, artist=artist, cover_url=cover_url, track_url=track_url, duration=duration or 0, album=album)
        db.add(track)
        db.commit()
        db.refresh(track)
    else:
        _update_existing_track(db, track, cover_url, track_url, duration, album)

    if track.duration == 0 and track.track_url:
        track.duration = await get_track_duration(track.track_url)
        db.commit()

    if not track.genre and track.track_url:
        track.genre = await get_track_genre(track.track_url)
        db.commit()

    return track

def _check_favorite(track: Track, user: User) -> bool:
    fav_art = user.profile.favorite_artist.lower() if (user.profile and user.profile.favorite_artist) else ""
    fav_trk = user.profile.favorite_track.lower() if (user.profile and user.profile.favorite_track) else ""
    fav_alb = user.profile.favorite_album.lower() if (user.profile and user.profile.favorite_album) else ""
    
    t_artist = track.artist.lower()
    t_title = track.title.lower()
    t_album = track.album.lower() if track.album else ""
    
    if fav_art and fav_art in t_artist: return True
    if fav_trk and (fav_trk in t_title or fav_trk in f"{t_artist} {t_title}"): return True
    if fav_alb and t_album and fav_alb in t_album: return True
    return False

def _handle_streak(db: Session, user: User):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    scrobbles_today = db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.played_at >= today_start, Scrobble.listened_sec * 100 >= Track.duration * 85).count()
    if scrobbles_today >= 5:
        today_str = today_start.strftime("%Y-%m-%d")
        yesterday_str = (today_start - timedelta(days=1)).strftime("%Y-%m-%d")
        
        last_streak_date = user.integration.last_streak_date
        if last_streak_date != today_str:
            if last_streak_date == yesterday_str: 
                user.integration.current_streak = (user.integration.current_streak or 0) + 1
            else: 
                user.integration.current_streak = 1
            user.integration.last_streak_date = today_str
            db.commit()

async def process_scrobble(db: Session, user: User, title: str, artist: str, cover_url: str, track_url: str, source: str, progress_sec: int, is_playing: bool, duration: int, album: str = None):
    track = await _get_or_create_track(db, title, artist, cover_url, track_url, duration, album)
    
    now = datetime.now(timezone.utc)
    last_scrobble = db.query(Scrobble).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).first()
    
    is_new = False
    if last_scrobble:
        l_played_at = last_scrobble.played_at.replace(tzinfo=timezone.utc) if last_scrobble.played_at.tzinfo is None else last_scrobble.played_at
        l_updated_at = last_scrobble.updated_at.replace(tzinfo=timezone.utc) if last_scrobble.updated_at.tzinfo is None else last_scrobble.updated_at
    else:
        l_played_at = None
        l_updated_at = None

    if not last_scrobble or last_scrobble.track_id != track.id:
        if last_scrobble and last_scrobble.is_playing and (now - l_updated_at).total_seconds() < 1.0:
            return "ignored_spam_protection"
            
        # Support skipping tracks quickly by deleting bare-listened tracks
        if last_scrobble and (now - l_played_at).total_seconds() < 15 and last_scrobble.listened_sec < 10:
            db.delete(last_scrobble)
            db.commit()
            
        is_new = True
    elif progress_sec < 5 and (last_scrobble.listened_sec or 0) > 30: 
        is_new = True
            
    if is_new:
        new_s = Scrobble(user_id=user.id, track_id=track.id, source=source, played_at=now, listened_sec=0, is_playing=is_playing, updated_at=now)
        db.add(new_s)
        db.commit()
        await manager.broadcast_to_user(user.username, {
            "type": "NEW_SCROBBLE",
            "track": format_history_item(new_s, track)
        })
    else:
        time_elapsed = (now - l_updated_at).total_seconds()
        old_listened = last_scrobble.listened_sec or 0
        
        # Use 35s limit to handle player update intervals
        if last_scrobble.is_playing and is_playing and 0 < time_elapsed < 35:
            last_scrobble.listened_sec = old_listened + int(round(time_elapsed))
            
        last_scrobble.is_playing = is_playing
        last_scrobble.updated_at = now
        db.commit()
        
        threshold = (track.duration if track.duration > 0 else 180) * 0.85
        if last_scrobble.listened_sec >= threshold and old_listened < threshold:
            is_fav = _check_favorite(track, user)
            last_scrobble.xp_earned = 2 if is_fav else 1
            db.commit()
            _handle_streak(db, user)
            
    return "ok"
