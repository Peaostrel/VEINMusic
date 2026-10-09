"""Private discovery, connection verification and reversible history tools."""
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import get_admin_user, get_current_user
from app.database import get_db
from app.models import LastfmImportJob, RecommendationFeedback, Scrobble, SourceHealth, Track, User
from app.routers.common import _get_visible_user
from app.routers.library import _track_dict
from app.services.cache import clear_all
from app.services.lastfm_import import job_to_dict
from app.services.source_health import MESSAGES
from app.services.music_story import weekly_story as build_weekly_story

router = APIRouter(tags=["quality"])
DB = Annotated[Session, Depends(get_db)]
Owner = Annotated[User, Depends(get_current_user)]
Admin = Annotated[User, Depends(get_admin_user)]


class FeedbackRequest(BaseModel):
    value: Literal["known", "dislike", "like", "reset"]


class HistoryEdit(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    artist: str = Field(min_length=1, max_length=300)
    album: str | None = Field(default=None, max_length=300)

    @field_validator("title", "artist")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Укажите название и исполнителя")
        return value.strip()


class ExcludeRequest(BaseModel):
    excluded: bool


@router.post("/api/me/recommendations/{track_id}/feedback", responses={404: {"description": "Track not found"}})
def feedback(track_id: int, data: FeedbackRequest, db: DB, user: Owner):
    if db.get(Track, track_id) is None:
        raise HTTPException(404, "Трек не найден")
    row = db.query(RecommendationFeedback).filter_by(user_id=user.id, track_id=track_id).first()
    if data.value == "reset":
        if row:
            db.delete(row)
    elif row:
        row.value = data.value  # type: ignore[assignment]
    else:
        db.add(RecommendationFeedback(user_id=user.id, track_id=track_id, value=data.value))
    db.commit()
    return {"status": "ok"}


def own_scrobble(db, user, scrobble_id):
    row = db.query(Scrobble).execution_options(include_excluded=True).filter_by(id=scrobble_id, user_id=user.id).first()
    if not row:
        raise HTTPException(404, "Прослушивание не найдено")
    return row


@router.patch("/api/me/scrobbles/{scrobble_id}/metadata", responses={404: {"description": "Listen not found in own history"}})
def edit_history(scrobble_id: int, data: HistoryEdit, db: DB, user: Owner):
    row = own_scrobble(db, user, scrobble_id)
    original = row.track
    # Only reassign this listen. Never mutate the shared catalog entry.
    track = db.query(Track).filter_by(title=data.title, artist=data.artist, album=data.album).first()
    if not track:
        track = Track(title=data.title, artist=data.artist, album=data.album,
                      duration=original.duration, genre=original.genre,
                      cover_url=original.cover_url, track_url=original.track_url)
        db.add(track)
        db.flush()
    row.track_id = track.id
    db.commit()
    clear_all()
    return {"status": "ok", "track": _track_dict(track)}


@router.patch("/api/me/scrobbles/{scrobble_id}/exclude", responses={404: {"description": "Listen not found in own history"}})
def exclude_history(scrobble_id: int, data: ExcludeRequest, db: DB, user: Owner):
    row = own_scrobble(db, user, scrobble_id)
    row.excluded_from_stats = data.excluded
    db.commit()
    clear_all()
    return {"status": "ok", "excluded": data.excluded}


@router.get("/api/me/imports")
def import_batches(db: DB, user: Owner):
    jobs = db.query(LastfmImportJob).filter_by(user_id=user.id).order_by(LastfmImportJob.id.desc()).limit(50).all()
    return [{**job_to_dict(job), "undoable": bool(db.query(Scrobble.id).execution_options(include_excluded=True)
             .filter_by(user_id=user.id, import_job_id=job.id).first()) and job.status in ("completed", "failed")}
            for job in jobs]


@router.delete("/api/me/imports/{job_id}", responses={404: {"description": "Import not found"}, 409: {"description": "Import is still active"}})
def undo_import(job_id: int, db: DB, user: Owner):
    job = db.query(LastfmImportJob).filter_by(id=job_id, user_id=user.id).with_for_update().first()
    if not job:
        raise HTTPException(404, "Импорт не найден")
    if job.status not in ("completed", "failed", "undone"):
        raise HTTPException(409, "Дождитесь завершения импорта")
    count = db.query(Scrobble).filter_by(user_id=user.id, import_job_id=job.id).delete(synchronize_session=False)
    job.status = "undone"  # type: ignore[assignment]
    db.commit()
    clear_all()
    return {"status": "ok", "removed": count}


@router.get("/api/me/connection-check")
def connection_check(db: DB, user: Owner, source: Annotated[Literal["spotify", "yandex", "youtube", "soundcloud", "lastfm", "extension"], Query()] = "extension", since: datetime | None = None):
    cutoff = max(_aware(since), datetime.now(UTC) - timedelta(minutes=10)) if since else datetime.now(UTC) - timedelta(minutes=10)
    health = db.query(SourceHealth).filter_by(user_id=user.id, source=source).first()
    recent = db.query(Scrobble).filter(
        Scrobble.user_id == user.id, Scrobble.is_imported.isnot(True), Scrobble.played_at >= cutoff)
    if source != "extension":
        recent = recent.filter(Scrobble.source.ilike(f"%{source}%"))
    else:
        recent = recent.filter(~Scrobble.source.in_(["spotify", "yandex", "soundcloud", "lastfm"]))
    listen = recent.order_by(Scrobble.id.desc()).first()
    stale = health is None or _aware(health.received_at) < datetime.now(UTC) - timedelta(minutes=3)
    status = str(health.status) if health and not stale else "waiting"
    return {"source": source, "received": bool(listen), "counted": bool(listen and
            int(listen.listened_sec or 0) * 100 >= int(listen.track.duration or 180) * 85),
            "status": status, "message": MESSAGES.get(status, "Включите музыку. Если событие не появится, проверьте подключение и разрешения расширения."),
            "last_event_at": health.received_at if health else None,
            "track": _track_dict(listen.track) if listen else None}


def _aware(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def artist_counts(db, user_id, start=None, end=None):
    query = db.query(Track.artist, func.count(Scrobble.id)).join(Scrobble, Scrobble.track_id == Track.id).filter(Scrobble.user_id == user_id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85)
    if start:
        query = query.filter(Scrobble.played_at >= start)
    if end:
        query = query.filter(Scrobble.played_at < end)
    return {artist: int(count) for artist, count in query.group_by(Track.artist).all() if artist}


@router.get("/api/me/taste-evolution")
def taste_evolution(db: DB, user: Owner):
    now = datetime.now(UTC)
    current = artist_counts(db, user.id, now - timedelta(days=30))
    previous = artist_counts(db, user.id, now - timedelta(days=60), now - timedelta(days=30))
    older = artist_counts(db, user.id, end=now - timedelta(days=60))

    def items(names):
        return [{"artist": name, "plays": current.get(name, 0), "previous_plays": previous.get(name, 0)}
                for name in sorted(names, key=lambda name: (-current.get(name, 0), -previous.get(name, 0), name))[:12]]
    previous_genres = {str(genre): int(count) for genre, count in db.query(Track.genre, func.count(Scrobble.id)).join(Scrobble, Scrobble.track_id == Track.id).filter(Scrobble.user_id == user.id, Scrobble.played_at >= now - timedelta(days=60), Scrobble.played_at < now - timedelta(days=30), Track.genre.isnot(None)).group_by(Track.genre).all()}
    genre_rows = db.query(Track.genre, func.count(Scrobble.id),
                          func.min(Scrobble.played_at)).join(Scrobble, Scrobble.track_id == Track.id).filter(
                             Scrobble.user_id == user.id, Scrobble.played_at >= now - timedelta(days=30), Track.genre.isnot(None)).group_by(Track.genre).all()
    return {"days": 30, "new": items(current.keys() - previous.keys() - older.keys()),
            "returning": items((current.keys() - previous.keys()) & older.keys()),
            "faded": items(previous.keys() - current.keys()),
            "genres": [{"genre": genre, "plays": int(count), "previous_plays": int(previous_genres.pop(genre, 0))} for genre, count, _ in genre_rows] + [{"genre": genre, "plays": 0, "previous_plays": int(count)} for genre, count in previous_genres.items()]}


@router.get("/api/me/shared-mix/{username}", responses={404: {"description": "User not found"}, 403: {"description": "History or statistics are private"}})
def shared_mix(username: str, request: Request, db: DB, user: Owner):
    other = _get_visible_user(username, request, db, "statistics")
    if other.is_banned:
        raise HTTPException(404, "Пользователь не найден")
    mine = artist_counts(db, user.id)
    theirs = artist_counts(db, other.id)
    common = sorted(mine.keys() & theirs.keys(), key=lambda artist: (-min(mine[artist], theirs[artist]), artist))[:20]
    # Both histories must be visible before exposing tracks from the other user.
    _get_visible_user(username, request, db, "history")
    rows = db.query(Track, func.count(Scrobble.id)).join(Scrobble, Scrobble.track_id == Track.id).filter(
        Scrobble.user_id.in_([user.id, other.id]), Track.artist.in_(common)).group_by(Track.id).order_by(func.count(Scrobble.id).desc(), Track.id).limit(30).all()
    return {"users": [user.username, other.username], "common_artists": common,
            "tracks": [{**_track_dict(track), "reason": f"Вы оба слушаете {track.artist}"} for track, _ in rows]}


@router.get("/api/me/weekly-story")
def weekly_story(db: DB, user: Owner):
    return build_weekly_story(user, db)


@router.get("/api/admin/quality")
def quality_metrics(db: DB, admin: Admin):
    cutoff = datetime.now(UTC) - timedelta(days=7)
    new_users = db.query(User.id).filter(User.created_at >= cutoff, User.is_banned.isnot(True)).subquery()
    registered = db.query(func.count()).select_from(new_users).scalar() or 0
    activated = db.query(func.count(func.distinct(Scrobble.user_id))).filter(
        Scrobble.user_id.in_(db.query(new_users.c.id)), Scrobble.is_imported.isnot(True), Scrobble.played_at >= cutoff).scalar() or 0
    rows = db.query(SourceHealth.source, func.count(SourceHealth.id), func.sum(SourceHealth.received_count),
                    func.sum(SourceHealth.error_count), func.avg(SourceHealth.processing_ms),
                    func.count(SourceHealth.first_success_at)).group_by(SourceHealth.source).all()
    return {"days": 7, "registered": int(registered), "activated": int(activated),
            "activation_percent": round(100 * activated / registered, 1) if registered else None,
            "sources": [{"source": source, "accounts": accounts, "events": int(events or 0),
                         "errors": int(errors or 0), "average_processing_ms": round(float(ms or 0), 1),
                         "verified_accounts": verified} for source, accounts, events, errors, ms, verified in rows],
            "note": "Счётчики источников накопительные с момента установки. Время — обработка последнего события каждого аккаунта, а не задержка доставки от плеера."}
