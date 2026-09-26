"""Admin panel: comment moderation, user card, catalog editing, analytics
time series, broadcasts and system status."""
from __future__ import annotations

import asyncio
import os
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.constants import USER_NOT_FOUND
from app.core.rate_limit import limiter
from app.core.security import get_admin_user, revoke_all_sessions
from app.database import get_db
from app.models import (
    ApiKey,
    ExternalSyncConfig,
    Follow,
    LastfmImportJob,
    PushSubscription,
    Scrobble,
    ScrobbleComment,
    ScrobbleLike,
    Track,
    User,
    UserAchievement,
    Webhook,
)
from app.services import audit, broadcast, system_status
from app.services.cache import delete_from_cache

router = APIRouter(prefix="/api/admin", tags=["admin"])

AdminUser = Annotated[User, Depends(get_admin_user)]
DB = Annotated[Session, Depends(get_db)]


def _counted_filter():
    return Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85


def _iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, (datetime, date)) else None


def _get_user(db: Session, username: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404, USER_NOT_FOUND)
    return user


# ─── COMMENT MODERATION ───────────────────────────────────────────────────────

@router.get("/comments")
def list_comments(
    db: DB, admin: AdminUser,
    q: Annotated[str | None, Query(max_length=100)] = None,
    username: Annotated[str | None, Query(max_length=64)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Latest comments with their author and the play they were left on."""
    query = db.query(ScrobbleComment, User).join(User, User.id == ScrobbleComment.user_id)
    if q:
        query = query.filter(ScrobbleComment.content.ilike(f"%{q}%"))
    if username:
        query = query.filter(User.username == username)
    total = query.count()
    rows = query.order_by(ScrobbleComment.id.desc()).offset(offset).limit(limit).all()

    scrobble_ids = {c.scrobble_id for c, _ in rows}
    plays: dict[int, dict[str, Any]] = {}
    if scrobble_ids:
        owner = db.query(User.id, User.username).subquery()
        for sid, title, artist, owner_name in (
            db.query(Scrobble.id, Track.title, Track.artist, owner.c.username)
            .join(Track, Track.id == Scrobble.track_id)
            .join(owner, owner.c.id == Scrobble.user_id)
            .filter(Scrobble.id.in_(scrobble_ids))
        ):
            plays[sid] = {"id": sid, "title": title, "artist": artist, "owner": owner_name}

    return {"total": total, "items": [{
        "id": c.id,
        "content": c.content,
        "created_at": _iso(c.created_at),
        "author": {"username": u.username, "is_banned": bool(u.is_banned),
                   "avatar_url": u.profile.avatar_url if u.profile else None},
        "scrobble": plays.get(int(c.scrobble_id)),
    } for c, u in rows]}


@router.delete("/comments/{comment_id}", responses={404: {"description": "Comment not found"}})
def delete_comment(comment_id: int, db: DB, admin: AdminUser):
    comment = db.query(ScrobbleComment).filter(ScrobbleComment.id == comment_id).first()
    if not comment:
        raise HTTPException(404, "Комментарий не найден")
    author = db.query(User.username).filter(User.id == comment.user_id).scalar()
    audit.record(db, admin, "comment.delete", author, text=str(comment.content or "")[:200])
    db.delete(comment)
    db.commit()
    delete_from_cache("global_history")
    return {"status": "ok"}


# ─── USER CARD ────────────────────────────────────────────────────────────────

def _user_counts(db: Session, user_id: int) -> dict[str, int]:
    scrobbles = db.query(func.count(Scrobble.id)).filter(Scrobble.user_id == user_id).scalar() or 0
    counted, xp = db.query(func.count(Scrobble.id), func.coalesce(func.sum(Scrobble.xp_earned), 0)) \
        .join(Track).filter(Scrobble.user_id == user_id, _counted_filter()).one()
    return {
        "scrobbles": int(scrobbles),
        "counted": int(counted or 0),
        "xp": int(xp or 0),
        "followers": db.query(Follow).filter(Follow.following_id == user_id).count(),
        "following": db.query(Follow).filter(Follow.follower_id == user_id).count(),
        "comments": db.query(ScrobbleComment).filter(ScrobbleComment.user_id == user_id).count(),
        "likes": db.query(ScrobbleLike).filter(ScrobbleLike.user_id == user_id).count(),
    }


def _account_block(user: User) -> dict[str, Any]:
    profile = user.profile
    return {
        "id": int(user.id),
        "username": user.username,
        "display_name": profile.display_name if profile else None,
        "avatar_url": profile.avatar_url if profile else None,
        "role": user.role or "user",
        "is_banned": bool(user.is_banned),
        "is_flagged": bool(user.is_flagged_antifraud),
        "antifraud_reason": user.antifraud_reason,
        "is_private": bool(profile.is_private) if profile else False,
        "location": profile.location if profile else None,
        "created_at": _iso(user.created_at),
        "session_version": int(user.session_version or 0),
    }


def _integration_block(user: User) -> dict[str, Any]:
    integration = user.integration
    if integration is None:
        return {"is_verified": False, "bonus_xp": 0, "current_streak": 0, "spotify_linked": False,
                "yandex_linked": False, "lastfm_username": None, "last_sync": None}
    return {
        "is_verified": bool(integration.is_verified),
        "bonus_xp": int(integration.bonus_xp or 0),
        "current_streak": int(integration.current_streak or 0),
        "spotify_linked": bool(integration.spotify_refresh_token),
        "yandex_linked": bool(integration.yandex_token),
        "lastfm_username": integration.lastfm_username,
        "last_sync": _iso(integration.last_sync),
    }


def _export_block(export: ExternalSyncConfig | None) -> dict[str, bool]:
    if export is None:
        return {"lastfm": False, "listenbrainz": False, "librefm": False}
    return {
        "lastfm": bool(export.is_lastfm_enabled and export.lastfm_session_key),
        "listenbrainz": bool(export.is_listenbrainz_enabled and export.listenbrainz_token),
        "librefm": bool(export.is_librefm_enabled and export.librefm_session_key),
    }


@router.get("/users/{username}/details", responses={404: {"description": "User not found"}})
def user_details(username: str, db: DB, admin: AdminUser):
    """Everything an admin needs to look into one account."""
    user = _get_user(db, username)
    uid = int(user.id)
    export = db.query(ExternalSyncConfig).filter(ExternalSyncConfig.user_id == uid).first()
    recent = (db.query(Scrobble, Track).join(Track).filter(Scrobble.user_id == uid)
              .order_by(Scrobble.id.desc()).limit(15).all())
    achievements = (db.query(UserAchievement).filter(UserAchievement.user_id == uid)
                    .order_by(UserAchievement.earned_at.desc()).all())
    return {
        "user": _account_block(user),
        "integration": _integration_block(user),
        "export": _export_block(export),
        "stats": _user_counts(db, uid),
        "api_keys": [{
            "id": k.id, "name": k.name, "prefix": k.prefix, "scopes": k.scopes,
            "is_active": bool(k.is_active), "created_at": _iso(k.created_at),
            "last_used_at": _iso(k.last_used_at), "expires_at": _iso(k.expires_at),
        } for k in db.query(ApiKey).filter(ApiKey.user_id == uid).order_by(ApiKey.id.desc())],
        "webhooks": [{"id": w.id, "url": w.url, "events": w.events, "is_active": bool(w.is_active)}
                     for w in db.query(Webhook).filter(Webhook.user_id == uid)],
        "push_subscriptions": db.query(PushSubscription).filter(PushSubscription.user_id == uid).count(),
        "recent_scrobbles": [{
            "id": s.id, "title": t.title, "artist": t.artist, "source": s.source,
            "listened_sec": s.listened_sec, "duration": t.duration, "xp": s.xp_earned,
            "played_at": _iso(s.played_at),
        } for s, t in recent],
        "achievements": [{"id": ua.achievement_id, "name": ua.achievement.name if ua.achievement else None,
                          "icon": ua.achievement.icon if ua.achievement else None,
                          "earned_at": _iso(ua.earned_at)} for ua in achievements],
        "imports": [{"id": j.id, "status": j.status, "lastfm_username": j.lastfm_username,
                     "imported_tracks": j.imported_tracks, "total_tracks": j.total_tracks,
                     "error": j.error_log}
                    for j in db.query(LastfmImportJob).filter(LastfmImportJob.user_id == uid)
                    .order_by(LastfmImportJob.id.desc()).limit(5)],
    }


@router.post("/users/{username}/sessions/revoke", responses={404: {"description": "User not found"}})
def revoke_user_sessions(username: str, db: DB, admin: AdminUser):
    """Sign the user out on every device (their API keys keep working)."""
    user = _get_user(db, username)
    revoke_all_sessions(user)
    audit.record(db, admin, "user.revoke_sessions", username)
    db.commit()
    return {"status": "ok"}


@router.post("/users/{username}/api-keys/{key_id}/revoke",
             responses={404: {"description": "User or key not found"}})
def revoke_user_api_key(username: str, key_id: int, db: DB, admin: AdminUser):
    user = _get_user(db, username)
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        raise HTTPException(404, "Ключ не найден")
    key.is_active = False  # type: ignore[assignment]
    audit.record(db, admin, "user.revoke_api_key", username, key=key.name, prefix=key.prefix)
    db.commit()
    return {"status": "ok"}


# ─── CATALOG ──────────────────────────────────────────────────────────────────

class TrackUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    artist: str | None = Field(None, min_length=1, max_length=300)
    album: str | None = Field(None, max_length=300)
    genre: str | None = Field(None, max_length=64)
    cover_url: str | None = Field(None, max_length=2048)
    track_url: str | None = Field(None, max_length=2048)
    duration: int | None = Field(None, ge=0, le=7200)

    @field_validator("cover_url", "track_url")
    @classmethod
    def _http_url(cls, value: str | None) -> str | None:
        if value:
            parsed = urlparse(value.strip())
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                raise ValueError("Нужна ссылка http(s)")
            return value.strip()
        return value


@router.get("/tracks")
def search_tracks(
    db: DB, admin: AdminUser,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """The whole catalog, searchable by title, artist or album, with play counts."""
    query = db.query(Track)
    if q:
        like = f"%{q}%"
        if q.isdigit():
            query = query.filter(Track.id == int(q))
        else:
            query = query.filter(Track.title.ilike(like) | Track.artist.ilike(like) | Track.album.ilike(like))
    total = query.count()
    tracks = query.order_by(Track.id.desc()).offset(offset).limit(limit).all()
    counts: dict[int, int] = {}
    if tracks:
        counts = {int(tid): int(n) for tid, n in db.query(Scrobble.track_id, func.count(Scrobble.id))
                  .filter(Scrobble.track_id.in_([t.id for t in tracks]))
                  .group_by(Scrobble.track_id).all()}
    return {"total": total, "items": [{
        "id": t.id, "title": t.title, "artist": t.artist, "album": t.album, "genre": t.genre,
        "cover_url": t.cover_url, "track_url": t.track_url, "duration": t.duration,
        "plays": counts.get(int(t.id), 0),
    } for t in tracks]}


@router.put("/tracks/{track_id}",
            responses={404: {"description": "Track not found"}, 400: {"description": "Empty title or artist"}})
def update_track(track_id: int, data: TrackUpdate, db: DB, admin: AdminUser):
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(404, "Трек не найден")
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if isinstance(value, str):
            value = value.strip()
            if not value:
                if field in ("title", "artist"):
                    raise HTTPException(400, "Название и исполнитель не могут быть пустыми")
                value = None  # clear optional text fields
        setattr(track, field, value)
    audit.record(db, admin, "catalog.edit_track", f"#{track_id}", **changes)
    db.commit()
    db.refresh(track)
    delete_from_cache("global_history")
    return {"status": "ok", "track": {
        "id": track.id, "title": track.title, "artist": track.artist, "album": track.album,
        "genre": track.genre, "cover_url": track.cover_url, "track_url": track.track_url,
        "duration": track.duration}}


# ─── ANALYTICS ────────────────────────────────────────────────────────────────

MIN_TIMESERIES_DAYS = 7
MAX_TIMESERIES_DAYS = 180


def _per_day(rows: list[tuple[Any, Any]]) -> dict[str, int]:
    """{'YYYY-MM-DD': n} from (day, n) rows (a date, or a string on SQLite)."""
    return {str(day)[:10]: int(n) for day, n in rows if day is not None}


@router.get("/analytics/timeseries")
def analytics_timeseries(
    db: DB, admin: AdminUser,
    days: Annotated[int, Query(ge=MIN_TIMESERIES_DAYS, le=MAX_TIMESERIES_DAYS)] = 30,
):
    """Sign-ups, counted plays and active listeners per day (UTC)."""
    # Query() already bounds it; clamped again so the loop bound is constant
    span = max(MIN_TIMESERIES_DAYS, min(int(days), MAX_TIMESERIES_DAYS))
    today = datetime.now(UTC).date()
    start_day = today - timedelta(days=span - 1)
    start = datetime.combine(start_day, datetime.min.time(), tzinfo=UTC)

    reg_day = func.date(User.created_at)
    registrations = _per_day(db.query(reg_day, func.count(User.id))
                             .filter(User.created_at >= start).group_by(reg_day).all())
    play_day = func.date(Scrobble.played_at)
    plays = db.query(play_day, func.count(Scrobble.id), func.count(func.distinct(Scrobble.user_id))) \
        .join(Track).filter(Scrobble.played_at >= start, _counted_filter()).group_by(play_day).all()
    scrobbles = _per_day([(d, n) for d, n, _ in plays])
    active = _per_day([(d, u) for d, _, u in plays])

    labels = [(start_day + timedelta(days=i)).isoformat() for i in range(span)]
    return {
        "days": labels,
        "registrations": [registrations.get(d, 0) for d in labels],
        "scrobbles": [scrobbles.get(d, 0) for d in labels],
        "active_users": [active.get(d, 0) for d in labels],
        "since": date.isoformat(start_day),
    }


# ─── BROADCAST ────────────────────────────────────────────────────────────────

class BroadcastRequest(BaseModel):
    title: str = Field("", max_length=80)
    message: str = Field(..., min_length=1, max_length=200)
    url: str = Field("/", max_length=200)
    channels: list[str] = Field(default_factory=lambda: ["inapp"], min_length=1)
    usernames: list[str] | None = Field(None, max_length=100)

    @field_validator("url")
    @classmethod
    def _internal_path(cls, value: str) -> str:
        # Push notifications open this path on the site: no external links
        if not value.startswith("/") or value.startswith("//"):
            raise ValueError("Ссылка должна быть путём на сайте, например /settings")
        return value

    @field_validator("channels")
    @classmethod
    def _known_channels(cls, value: list[str]) -> list[str]:
        unknown = set(value) - {"inapp", "push"}
        if unknown:
            raise ValueError(f"Неизвестные каналы: {', '.join(sorted(unknown))}")
        return sorted(set(value))


@router.post("/broadcast", responses={400: {"description": "No recipients"}})
@limiter.limit("10/hour")
async def send_broadcast(request: Request, data: BroadcastRequest, db: DB, admin: AdminUser):
    """Announcement to everyone (or the listed users): in-app and/or Web Push."""
    user_ids = await asyncio.to_thread(broadcast.recipient_ids, db, data.usernames)
    if not user_ids:
        raise HTTPException(400, "Нет получателей")
    text = broadcast.compose(data.title, data.message)
    inapp = 0
    if "inapp" in data.channels:
        inapp = await asyncio.to_thread(broadcast.create_inapp, db, admin, user_ids, text)
    audit.record(db, admin, "broadcast.send", "все" if not data.usernames else ", ".join(data.usernames)[:128],
                 channels=data.channels, recipients=len(user_ids), text=text)
    await asyncio.to_thread(db.commit)
    push_queued = False
    if "push" in data.channels:
        from app.core.redis import enqueue_background_task
        push_queued = bool(await enqueue_background_task(
            "broadcast_push", data.title or "VEIN Music", data.message, data.url,
            user_ids if data.usernames else None))
    return {"status": "ok", "recipients": len(user_ids), "inapp": inapp, "push_queued": push_queued}


# ─── SYSTEM STATUS ────────────────────────────────────────────────────────────

def _local_status(db: Session) -> dict[str, Any]:
    from app.routers.media import UPLOADS_DIR
    return {
        "database": system_status.database_status(db),
        "uploads": system_status._dir_usage(UPLOADS_DIR),
        "backups": system_status.backups_status(os.getenv("BACKUP_DIR", "/backups")),
    }


@router.get("/system/status")
async def get_system_status(db: DB, admin: AdminUser):
    local = await asyncio.to_thread(_local_status, db)
    return {"worker": await system_status.worker_status(), **local}
