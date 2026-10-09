"""Personal library maintenance, unified search and music detail pages."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import extract, func, or_
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models import Scrobble, SourceHealth, Track, TrackAlias, User, UserProfile
from app.schemas import ScrobbleMergeRequest
from app.services import runtime_settings
from app.services.cache import clear_all
from app.services.user_preferences import get_preferences
from app.services.source_health import MESSAGES, source_key

router = APIRouter(tags=["library"])
TRACK_NOT_FOUND = "Трек не найден"


def _track_dict(track: Track, plays: int = 0) -> dict:
    return {
        "id": int(track.id),
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "genre": track.genre,
        "cover_url": track.cover_url,
        "track_url": track.track_url,
        "duration": int(track.duration or 0),
        "plays": int(plays or 0),
    }


def _public_play_counts(db: Session):
    """Aggregate plays without leaking activity from private or banned users."""
    return (
        db.query(
            Scrobble.track_id.label("track_id"),
            func.count(Scrobble.id).label("plays"),
        )
        .join(User, User.id == Scrobble.user_id)
        .join(UserProfile, UserProfile.user_id == User.id)
        .filter(UserProfile.is_private.isnot(True), User.is_banned.isnot(True))
        .group_by(Scrobble.track_id)
        .subquery()
    )


@router.get(
    "/api/search",
    responses={422: {"description": "Search query is shorter than two characters"}},
)
def unified_search(
    q: Annotated[str, Query(min_length=2, max_length=100)],
    db: Annotated[Session, Depends(get_db)],
):
    """Search profiles, artists, tracks and albums in one request."""
    cleaned = q.strip()
    if len(cleaned) < 2:
        raise HTTPException(422, "Введите хотя бы два символа")
    term = f"%{cleaned}%"
    public_plays = _public_play_counts(db)
    users = (
        db.query(User)
        .join(UserProfile)
        .filter(
            UserProfile.is_private.isnot(True),
            User.is_banned.isnot(True),
            or_(User.username.ilike(term), UserProfile.display_name.ilike(term)),
        )
        .order_by(User.username)
        .limit(5)
        .all()
    )
    tracks = (
        db.query(Track, func.coalesce(public_plays.c.plays, 0).label("plays"))
        .outerjoin(public_plays, public_plays.c.track_id == Track.id)
        .filter(
            public_plays.c.plays.isnot(None),
            or_(Track.title.ilike(term), Track.artist.ilike(term), Track.album.ilike(term)),
        )
        .order_by(func.coalesce(public_plays.c.plays, 0).desc(), Track.artist, Track.title)
        .limit(8)
        .all()
    )
    artists = (
        db.query(
            Track.artist,
            func.count(func.distinct(Track.id)).label("tracks"),
            func.coalesce(func.sum(public_plays.c.plays), 0).label("plays"),
            func.max(Track.cover_url).label("cover_url"),
        )
        .outerjoin(public_plays, public_plays.c.track_id == Track.id)
        .filter(Track.artist.ilike(term), public_plays.c.plays.isnot(None))
        .group_by(Track.artist)
        .order_by(func.coalesce(func.sum(public_plays.c.plays), 0).desc(), Track.artist)
        .limit(6)
        .all()
    )
    return {
        "users": [
            {
                "username": user.username,
                "display_name": user.profile.display_name or user.username,
                "avatar_url": user.profile.avatar_url,
                "role": user.role,
                "is_verified": bool(user.integration and user.integration.is_verified),
            }
            for user in users
        ],
        "artists": [
            {"name": row[0], "tracks": int(row[1]), "plays": int(row[2]), "cover_url": row[3]}
            for row in artists
        ],
        "tracks": [_track_dict(track, plays) for track, plays in tracks],
    }


def _public_scrobble_query(db: Session):
    return (
        db.query(Scrobble)
        .join(User, User.id == Scrobble.user_id)
        .join(UserProfile, UserProfile.user_id == User.id)
        .filter(UserProfile.is_private.isnot(True), User.is_banned.isnot(True))
    )


@router.get(
    "/api/music/artist/{artist}",
    responses={404: {"description": "Artist not found in the public catalog"}},
)
def artist_details(artist: str, db: Annotated[Session, Depends(get_db)]):
    public_plays = _public_play_counts(db)
    tracks = (
        db.query(Track, func.coalesce(public_plays.c.plays, 0).label("plays"))
        .outerjoin(public_plays, public_plays.c.track_id == Track.id)
        .filter(
            func.lower(Track.artist) == artist.strip().lower(),
            public_plays.c.plays.isnot(None),
        )
        .order_by(func.coalesce(public_plays.c.plays, 0).desc(), Track.title)
        .all()
    )
    if not tracks:
        raise HTTPException(404, "Артист не найден")
    public_plays = (
        _public_scrobble_query(db)
        .join(Track, Track.id == Scrobble.track_id)
        .filter(func.lower(Track.artist) == artist.strip().lower())
        .count()
    )
    return {
        "name": tracks[0][0].artist,
        "cover_url": next((track.cover_url for track, _ in tracks if track.cover_url), None),
        "tracks_count": len(tracks),
        "public_plays": public_plays,
        "tracks": [_track_dict(track, plays) for track, plays in tracks[:100]],
    }


@router.get(
    "/api/music/track/{track_id}",
    responses={404: {"description": "Track not found in the public catalog"}},
)
def track_details(track_id: int, db: Annotated[Session, Depends(get_db)]):
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(404, TRACK_NOT_FOUND)
    public = _public_scrobble_query(db).filter(Scrobble.track_id == track_id)
    public_count = public.count()
    if not public_count:
        raise HTTPException(404, TRACK_NOT_FOUND)
    source_rows = (
        public.with_entities(Scrobble.source, func.count(Scrobble.id))
        .group_by(Scrobble.source)
        .all()
    )
    data = _track_dict(track, public_count)
    data["source_counts"] = {str(source): int(count) for source, count in source_rows}
    return data


def _duplicate_key(title: str, artist: str) -> str:
    value = f"{artist} {title}".casefold().replace("ё", "е")
    value = re.sub(
        r"[\[(](?:remaster(?:ed)?|live|explicit|radio edit|deluxe|slowed|reverb|sped up|version|edit)[^\])]*[\])]",
        " ",
        value,
        flags=re.IGNORECASE,
    )
    return re.sub(r"[^\wа-я]+", "", value, flags=re.IGNORECASE)


@router.get("/api/me/scrobbles/duplicates")
def duplicate_scrobbles(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    rows = (
        db.query(Track, func.count(Scrobble.id).label("plays"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == current_user.id)
        .group_by(Track.id)
        .order_by(func.count(Scrobble.id).desc())
        .limit(1000)
        .all()
    )
    groups: dict[str, list[dict]] = {}
    for track, plays in rows:
        groups.setdefault(_duplicate_key(track.title, track.artist), []).append(
            _track_dict(track, plays)
        )
    duplicates = [items for items in groups.values() if len(items) > 1]
    duplicates.sort(key=lambda items: sum(item["plays"] for item in items), reverse=True)
    return {"groups": duplicates[:100], "total": len(duplicates)}


@router.get("/api/me/scrobbles/manage")
def manageable_scrobbles(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str, Query(max_length=100)] = "",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
):
    query = (
        db.query(Scrobble, Track).execution_options(include_excluded=True)
        .join(Track, Track.id == Scrobble.track_id)
        .filter(Scrobble.user_id == current_user.id)
    )
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Track.title.ilike(term), Track.artist.ilike(term)))
    rows = query.order_by(Scrobble.played_at.desc()).limit(limit).all()
    return [
        {
            "id": int(scrobble.id),
            "played_at": scrobble.played_at,
            "source": scrobble.source,
            "listened_sec": int(scrobble.listened_sec or 0),
            "excluded_from_stats": bool(scrobble.excluded_from_stats),
            "is_imported": bool(scrobble.is_imported),
            "import_job_id": scrobble.import_job_id,
            "track": _track_dict(track),
        }
        for scrobble, track in rows
    ]


@router.delete(
    "/api/me/scrobbles/{scrobble_id}",
    responses={404: {"description": "Scrobble not found in the user's history"}},
)
def delete_own_scrobble(
    scrobble_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    scrobble = db.query(Scrobble).execution_options(include_excluded=True).filter(
        Scrobble.id == scrobble_id, Scrobble.user_id == current_user.id
    ).first()
    if not scrobble:
        raise HTTPException(404, "Прослушивание не найдено")
    db.delete(scrobble)
    db.commit()
    clear_all()
    return {"status": "ok"}


@router.post(
    "/api/me/scrobbles/merge",
    responses={
        400: {"description": "Source and target tracks must be different"},
        403: {"description": "Tracks do not both belong to the user's history"},
        404: {"description": "Source or target track not found"},
    },
)
def merge_own_tracks(
    data: ScrobbleMergeRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    if data.source_track_id == data.target_track_id:
        raise HTTPException(400, "Выберите два разных трека")
    tracks = db.query(Track).filter(
        Track.id.in_([data.source_track_id, data.target_track_id])
    ).all()
    by_id = {int(track.id): track for track in tracks}
    source = by_id.get(data.source_track_id)
    target = by_id.get(data.target_track_id)
    if not source or not target:
        raise HTTPException(404, TRACK_NOT_FOUND)
    owned_ids = {
        int(row[0])
        for row in db.query(Scrobble.track_id).filter(
            Scrobble.user_id == current_user.id,
            Scrobble.track_id.in_([data.source_track_id, data.target_track_id]),
        ).distinct()
    }
    if owned_ids != {data.source_track_id, data.target_track_id}:
        raise HTTPException(403, "Можно объединять только треки из своей истории")
    count = (
        db.query(Scrobble)
        .filter(
            Scrobble.user_id == current_user.id,
            Scrobble.track_id == data.source_track_id,
        )
        .update({Scrobble.track_id: data.target_track_id})
    )
    alias = db.query(TrackAlias).filter_by(
        user_id=current_user.id,
        original_title=source.title,
        original_artist=source.artist,
    ).first()
    if alias:
        alias.canonical_track_id = target.id
    else:
        db.add(
            TrackAlias(
                user_id=current_user.id,
                original_title=source.title,
                original_artist=source.artist,
                canonical_track_id=target.id,
            )
        )
    db.commit()
    clear_all()
    return {"status": "ok", "reassigned_scrobbles": int(count)}


@router.get("/api/me/memories")
def music_memories(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    now = datetime.now(UTC)
    on_this_day = (
        db.query(Scrobble, Track)
        .join(Track, Track.id == Scrobble.track_id)
        .filter(
            Scrobble.user_id == current_user.id,
            extract("month", Scrobble.played_at) == now.month,
            extract("day", Scrobble.played_at) == now.day,
            extract("year", Scrobble.played_at) < now.year,
        )
        .order_by(Scrobble.played_at.desc())
        .limit(8)
        .all()
    )
    cutoff = now - timedelta(days=90)
    forgotten = (
        db.query(
            Track,
            func.count(Scrobble.id).label("plays"),
            func.max(Scrobble.played_at).label("last_played"),
        )
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == current_user.id)
        .group_by(Track.id)
        .having(func.count(Scrobble.id) >= 2, func.max(Scrobble.played_at) < cutoff)
        .order_by(func.count(Scrobble.id).desc())
        .limit(8)
        .all()
    )
    return {
        "on_this_day": [
            {**_track_dict(track), "played_at": scrobble.played_at}
            for scrobble, track in on_this_day
        ],
        "forgotten": [
            {**_track_dict(track, plays), "last_played": last_played}
            for track, plays, last_played in forgotten
        ],
    }


@router.get("/api/integrations/status")
def integration_status(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    preferences = get_preferences(current_user.profile).integrations
    integration = current_user.integration
    definitions = [
        ("spotify", "Spotify", bool(integration.spotify_access_token), "cloud", preferences.spotify_enabled),
        ("yandex", "Яндекс Музыка", bool(integration.yandex_token), "cloud", preferences.yandex_enabled),
        ("soundcloud", "SoundCloud", bool(integration.soundcloud_access_token), "cloud", preferences.soundcloud_enabled),
        ("youtube_music", "YouTube Music", bool(current_user.api_key), "extension", preferences.youtube_music_enabled),
        ("lastfm", "Last.fm", bool(integration.lastfm_username), "import", preferences.lastfm_enabled),
    ]
    diagnostics = {row.source: row for row in db.query(SourceHealth).filter_by(user_id=current_user.id).all()}

    def diagnostic(key):
        row = diagnostics.get(source_key(key))
        return {"last_event_at": row.received_at if row else None,
                "diagnostic": MESSAGES.get(str(row.status), "Нет свежих событий. Включите музыку и проверьте подключение.") if row else "Событий пока нет. Запустите проверку первого прослушивания.",
                "error": bool(row and row.status in ("token_expired", "network_error", "provider_error"))}

    return {
        "auto_sync": preferences.auto_sync,
        "last_sync": integration.last_sync,
        "services": [
            {
                **diagnostic(key),
                "id": key,
                "name": name,
                "linked": linked,
                "mode": mode,
                "user_enabled": bool(user_enabled),
                "admin_enabled": runtime_settings.is_feature_enabled(
                    f"integration_{key}", db
                ),
            }
            for key, name, linked, mode, user_enabled in definitions
        ],
    }
