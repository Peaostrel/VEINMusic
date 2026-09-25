"""Last.fm history import."""

import logging
import os
from datetime import UTC, datetime

import httpx

from app.core.constants import TEXT_KEY
from app.core.websockets import manager
from app.models import (
    Scrobble,
    Track,
    User,
)

logger = logging.getLogger(__name__)

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/"
IMPORTING_USERS: set[str] = set()


def _validate_import_user(db, user_id: int):
    """Validate that user exists and has required Last.fm settings. Returns (user, error_msg)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None, f"Import Error: User {user_id} not found"
    if not user.integration.lastfm_username:
        return None, f"Import Error: Last.fm username not set for user {user.username}"
    if not LASTFM_API_KEY:
        return None, "Import Error: LASTFM_API_KEY is missing in .env"
    return user, None


def _get_or_create_import_track(
        db,
        title: str,
        artist: str,
        cover: str | None,
        album: str | None) -> Track:
    """Find or create a track during Last.fm import."""
    track = db.query(Track).filter(
        Track.title == title,
        Track.artist == artist).first()
    if not track:
        track = Track(
            title=title,
            artist=artist,
            cover_url=cover,
            album=album,
            duration=180)
        db.add(track)
        db.commit()
        db.refresh(track)
    return track


async def _import_lastfm_page(db, client, user, page: int):
    """Fetch and import a single page of Last.fm history. Returns (tracks_imported, total_pages) or None on error."""
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
        logger.warning(f"Last.fm API Error: {resp.status_code} - {resp.text}")
        return None, None
    res = resp.json()
    if "error" in res:
        logger.warning(f"Last.fm API Logic Error: {res.get('message')}")
        return None, None

    tracks = res.get("recenttracks", {}).get("track", [])
    total_pages = int(
        res.get(
            "recenttracks",
            {}).get(
            "@attr",
            {}).get(
                "totalPages",
            1))
    logger.info(
        f"Importing page {page}/{total_pages} for user {user.username}, found {len(tracks)} tracks")

    imported_count = 0
    for t in tracks:
        if t.get("@attr", {}).get("nowplaying") == "true":
            continue
        title = t.get("name")
        artist = (t.get("artist") or {}).get(TEXT_KEY)
        if not title or not artist:
            continue
        album = (t.get("album") or {}).get(TEXT_KEY)
        images = t.get("image") or []
        cover = (images[-1] or {}).get(TEXT_KEY) if images else None
        uts = int((t.get("date") or {}).get("uts", 0))
        if not uts:
            continue
        dt = datetime.fromtimestamp(uts, tz=UTC)

        existing = db.query(Scrobble).filter(
            Scrobble.user_id == user.id,
            Scrobble.played_at == dt).first()
        if existing:
            continue

        track = _get_or_create_import_track(db, title, artist, cover, album)
        duration = track.duration or 180
        scrobble = Scrobble(
            user_id=user.id,
            track_id=track.id,
            source="lastfm",
            played_at=dt,
            listened_sec=duration,
            is_playing=False,
            updated_at=dt,
            xp_earned=1,
            is_imported=True)
        db.add(scrobble)
        imported_count += 1

    db.commit()
    return imported_count, total_pages


async def import_lastfm_history(user_id: int, db_session_factory):
    db = db_session_factory()
    imported_count = 0
    try:
        user, error = _validate_import_user(db, user_id)
        if error:
            logger.warning(error)
            return

        succeeded = False
        async with httpx.AsyncClient(timeout=15.0) as client:
            page = 1
            total_pages = 1
            # Limit to 5 pages (1000 tracks) for now
            while page <= total_pages and page <= 5:
                page_count, total_pages = await _import_lastfm_page(db, client, user, page)
                if page_count is None:
                    break
                succeeded = True
                imported_count += page_count
                page += 1

        if not succeeded:
            await manager.broadcast_to_user(user.username, {"type": "IMPORT_FINISHED", "message": "❌ Импорт из Last.fm не удался. Попробуйте позже."})
            return

        user.integration.has_imported_lastfm = True
        db.commit()

        logger.info(
            f"Import Finished: Imported {imported_count} scrobbles for user {user.username}")
        # Notify user via WebSocket if connected
        await manager.broadcast_to_user(user.username, {"type": "IMPORT_FINISHED", "message": f"✅ Импорт завершен! Добавлено {imported_count} треков."})

    except Exception as e:
        logger.warning(f"Last.fm Import Logic Error: {e}")
    finally:
        IMPORTING_USERS.discard(str(user_id))
        db.close()
