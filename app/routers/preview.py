"""Link previews and the sitemap: what search engines and messengers see.

The site renders profiles, artists and tracks in the browser, so its server
asks these endpoints for a page's title, description and picture. They only
return what an anonymous visitor may see: private and banned profiles give
nothing beyond a name, and statistics follow the profile's privacy settings.
"""

from __future__ import annotations

import asyncio
import logging
import os
import urllib.parse
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.safe_http import UnsafeURLError, pinned_download
from app.database import get_db
from app.models import Scrobble, Track, User, UserProfile
from app.routers.media import API_BASE_URL, UPLOADS_DIR
from app.services.cache import get_from_cache, set_to_cache
from app.services.privacy import audience_cache_key, public_statistics_users
from app.services.user_preferences import preferences_dict
from app.services.user_stats import get_user_level_info

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/preview", tags=["preview"])

PREVIEW_TTL = 600  # seconds; previews may lag the profile by a few minutes
SITEMAP_TTL = 3600
SITEMAP_USERS = 5000
SITEMAP_BATCH = 1000
SITEMAP_SCAN_LIMIT = 50_000  # public profiles looked at, at most
SITEMAP_ARTISTS = 2000
SITEMAP_TRACKS = 5000
MAX_IMAGE_BYTES = 3 * 1024 * 1024
DOWNLOAD_DEADLINE = 10  # seconds for the whole picture, however it trickles in
NOT_FOUND = "Не найдено"
IMAGE_NOT_FOUND = "Нет картинки"

# Magic bytes of the formats the preview renderer can draw
_IMAGE_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)


def _counted(query):
    """Only plays long enough to count, as in the profile statistics."""
    return query.filter(
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85
    )


def _anonymous_can_see(profile: UserProfile | None, section: str) -> bool:
    if profile is None or profile.is_private:
        return False
    return preferences_dict(profile).get("privacy", {}).get(section, "all") == "all"


def _indexable(user: User) -> bool:
    profile = user.profile
    if profile is None or profile.is_private or user.is_banned:
        return False
    return bool(preferences_dict(profile).get("privacy", {}).get("search_indexing", True))


def _public_user(db: Session, username: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if not user or user.is_banned or user.profile is None:
        raise HTTPException(404, NOT_FOUND)
    return user


def _public_scrobbles(db: Session):
    return (
        db.query(Scrobble)
        .join(User, User.id == Scrobble.user_id)
        .join(UserProfile, UserProfile.user_id == User.id)
        .filter(UserProfile.is_private.isnot(True), User.is_banned.isnot(True),
                Scrobble.user_id.in_(list(public_statistics_users(db).values())))
    )


def _redact_cached_user_preview(cached, user):
    data = dict(cached)
    data["indexable"] = _indexable(user)
    if not _anonymous_can_see(user.profile, "statistics"):
        for field in ("scrobbles", "top_artist", "level", "rank"):
            data[field] = None
    return data


@router.get("/user/{username}", responses={404: {"description": "No such public user"}})
def user_preview(username: str, db: Annotated[Session, Depends(get_db)]):
    user = _public_user(db, username)
    profile = user.profile
    cache_key = f"preview:user:{username}"
    cached = get_from_cache(cache_key, PREVIEW_TTL)
    if cached is not None and not profile.is_private:
        return _redact_cached_user_preview(cached, user)
    data: dict = {
        "username": user.username,
        "display_name": profile.display_name or user.username,
        "has_avatar": bool(profile.avatar_url),
        "is_private": bool(profile.is_private),
        "indexable": _indexable(user),
        "bio": None,
        "level": None,
        "rank": None,
        "scrobbles": None,
        "top_artist": None,
    }
    if not profile.is_private:
        bio = (profile.bio or "").strip()
        data["bio"] = bio[:200] or None
        if _anonymous_can_see(profile, "statistics"):
            data["level"], data["rank"], _, _ = get_user_level_info(user, db)
            base = _counted(db.query(Scrobble).join(Track)).filter(Scrobble.user_id == user.id)
            data["scrobbles"] = base.count()
            top = (
                base.with_entities(Track.artist, func.count(Scrobble.id).label("plays"))
                .group_by(Track.artist)
                .order_by(func.count(Scrobble.id).desc(), Track.artist)
                .first()
            )
            data["top_artist"] = top[0] if top else None
    set_to_cache(cache_key, data, PREVIEW_TTL)
    return data


def _artist_tracks(db: Session, artist: str):
    return (
        _public_scrobbles(db)
        .join(Track, Track.id == Scrobble.track_id)
        .filter(or_(
            Track.artist == artist.strip(),
            # SQLite lowercases only ASCII; PostgreSQL handles Cyrillic too
            func.lower(Track.artist) == artist.strip().lower(),
        ))
    )


@router.get("/artist/{artist}", responses={404: {"description": "Artist not in the public catalog"}})
def artist_preview(artist: str, db: Annotated[Session, Depends(get_db)]):
    cache_key = audience_cache_key(f"preview:artist:{artist.strip().lower()}", public_statistics_users(db).values())
    cached = get_from_cache(cache_key, PREVIEW_TTL)
    if cached is not None:
        return cached
    base = _artist_tracks(db, artist)
    row = base.with_entities(
        func.min(Track.artist),
        func.count(Scrobble.id),
        func.count(func.distinct(Track.id)),
    ).first()
    if not row or not row[1]:
        raise HTTPException(404, NOT_FOUND)
    top = (
        base.with_entities(Track.title, func.count(Scrobble.id))
        .group_by(Track.title)
        .order_by(func.count(Scrobble.id).desc(), Track.title)
        .first()
    )
    has_cover = base.filter(Track.cover_url.isnot(None), Track.cover_url != "").first() is not None
    data = {
        "name": row[0],
        "plays": int(row[1]),
        "tracks": int(row[2]),
        "top_track": top[0] if top else None,
        "has_cover": has_cover,
    }
    set_to_cache(cache_key, data, PREVIEW_TTL)
    return data


@router.get("/track/{track_id}", responses={404: {"description": "Track not in the public catalog"}})
def track_preview(track_id: int, db: Annotated[Session, Depends(get_db)]):
    cache_key = audience_cache_key(f"preview:track:{track_id}", public_statistics_users(db).values())
    cached = get_from_cache(cache_key, PREVIEW_TTL)
    if cached is not None:
        return cached
    track = db.query(Track).filter(Track.id == track_id).first()
    plays = _public_scrobbles(db).filter(Scrobble.track_id == track_id).count() if track else 0
    if not track or not plays:
        raise HTTPException(404, NOT_FOUND)
    data = {
        "id": int(track.id),
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "plays": int(plays),
        "has_cover": bool(track.cover_url),
    }
    set_to_cache(cache_key, data, PREVIEW_TTL)
    return data


def _image_url(db: Session, kind: str, key: str) -> str | None:
    if kind == "user":
        user = _public_user(db, key)
        return str(user.profile.avatar_url) if user.profile.avatar_url else None
    if kind == "artist":
        row = (
            _artist_tracks(db, key)
            .filter(Track.cover_url.isnot(None), Track.cover_url != "")
            .with_entities(Track.cover_url, func.count(Scrobble.id))
            .group_by(Track.cover_url)
            .order_by(func.count(Scrobble.id).desc())
            .first()
        )
        return row[0] if row else None
    if kind == "track":
        if not key.isdigit():
            raise HTTPException(404, NOT_FOUND)
        track = db.query(Track).filter(Track.id == int(key)).first()
        if not track or not _public_scrobbles(db).filter(Scrobble.track_id == track.id).first():
            raise HTTPException(404, NOT_FOUND)
        return str(track.cover_url) if track.cover_url else None
    raise HTTPException(404, NOT_FOUND)


def _image_type(content: bytes) -> str | None:
    for signature, media_type in _IMAGE_SIGNATURES:
        if content.startswith(signature):
            return media_type
    return None


def _read_upload(url: str) -> bytes | None:
    """An avatar uploaded to this API: read the file instead of fetching it."""
    prefix = f"{API_BASE_URL.rstrip('/')}/uploads/"
    if not url.startswith(prefix):
        return None
    name = os.path.basename(urllib.parse.unquote(url[len(prefix):].split("?", 1)[0]))
    path = os.path.join(UPLOADS_DIR, name)
    if not name or not os.path.isfile(path) or os.path.getsize(path) > MAX_IMAGE_BYTES:
        return b""
    with open(path, "rb") as file:
        return file.read()


async def _download(url: str) -> bytes:
    try:
        async with asyncio.timeout(DOWNLOAD_DEADLINE):
            content = await pinned_download(url, max_bytes=MAX_IMAGE_BYTES)
    except UnsafeURLError as exc:
        logger.info("Preview image %s refused: %s", url, exc)
        return b""
    except Exception as exc:  # NOSONAR - any network failure means "no picture"
        logger.info("Preview image %s not fetched: %s", url, exc)
        return b""
    return content or b""


@router.get(
    "/{kind}/{key}/image",
    responses={404: {"description": "No picture usable in a preview"}},
)
async def preview_image(kind: str, key: str, db: Annotated[Session, Depends(get_db)]):
    """The avatar or cover for a preview card, as PNG, JPEG or GIF.

    Only the picture of a public profile, artist or track can be requested,
    never an arbitrary URL, and remote pictures go through the SSRF-safe
    client. WebP and other formats the card renderer can't draw give 404:
    the card then shows the initial instead.
    """
    url = _image_url(db, kind, key)
    if not url:
        raise HTTPException(404, IMAGE_NOT_FOUND)
    content = _read_upload(url)
    if content is None:
        content = await _download(url)
    media_type = _image_type(content) if content else None
    if not media_type:
        raise HTTPException(404, IMAGE_NOT_FOUND)
    return Response(
        content,
        media_type=media_type,
        headers={"Cache-Control": f"public, max-age={PREVIEW_TTL}"},
    )


def _iso(value: object) -> str | None:
    """A timestamp from an aggregate (a string on some SQLite setups)."""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value else None


@router.get("/sitemap")
def sitemap(db: Annotated[Session, Depends(get_db)]):
    """Public profiles, artists and tracks for the site's sitemap.xml."""
    profiles = db.query(User.id, UserProfile).join(UserProfile, UserProfile.user_id == User.id).filter(
        User.is_banned.isnot(True), UserProfile.is_private.isnot(True)).all()
    indexable_ids = [int(uid) for uid, profile in profiles
                     if preferences_dict(profile)["privacy"]["search_indexing"]]
    cache_key = audience_cache_key("preview:sitemap:v2", indexable_ids)
    cache_key = audience_cache_key(cache_key, public_statistics_users(db).values())
    cached = get_from_cache(cache_key, SITEMAP_TTL)
    if cached is not None:
        return cached
    last_play = (
        db.query(Scrobble.user_id, func.max(Scrobble.played_at).label("last"))
        .group_by(Scrobble.user_id)
        .subquery()
    )
    recent = (
        db.query(User, last_play.c.last)
        .join(UserProfile, UserProfile.user_id == User.id)
        .join(last_play, last_play.c.user_id == User.id)
        .filter(UserProfile.is_private.isnot(True), User.is_banned.isnot(True))
        .order_by(last_play.c.last.desc(), User.id)
    )
    # The search-engine opt-out lives in the preferences JSON, so it is
    # checked here: scan in batches until the sitemap is full, so profiles
    # that opted out don't take the places of those that didn't
    users: list[tuple[User, object]] = []
    for offset in range(0, SITEMAP_SCAN_LIMIT, SITEMAP_BATCH):
        batch = recent.offset(offset).limit(SITEMAP_BATCH).all()
        users.extend((user, last) for user, last in batch if _indexable(user))
        if len(users) >= SITEMAP_USERS or len(batch) < SITEMAP_BATCH:
            break
    users = users[:SITEMAP_USERS]
    public = _public_scrobbles(db).join(Track, Track.id == Scrobble.track_id)
    artists = (
        public.with_entities(Track.artist, func.count(Scrobble.id))
        .filter(Track.artist.isnot(None), Track.artist != "")
        .group_by(Track.artist)
        .order_by(func.count(Scrobble.id).desc(), Track.artist)
        .limit(SITEMAP_ARTISTS)
        .all()
    )
    tracks = (
        public.with_entities(Track.id, func.max(Scrobble.played_at))
        .group_by(Track.id)
        .order_by(func.count(Scrobble.id).desc(), Track.id)
        .limit(SITEMAP_TRACKS)
        .all()
    )
    data = {
        "users": [
            {"username": user.username, "updated": _iso(last)}
            for user, last in users
        ],
        "artists": [row[0] for row in artists],
        "tracks": [
            {"id": int(row[0]), "updated": _iso(row[1])}
            for row in tracks
        ],
    }
    set_to_cache(cache_key, data, SITEMAP_TTL)
    return data
