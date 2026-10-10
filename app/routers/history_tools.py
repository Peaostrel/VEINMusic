"""Bounded, owner-only history pagination and reversible batch changes."""
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal, cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import literal, or_, tuple_
from sqlalchemy.orm import Session

from app.core.rate_limit import credential_key, limiter
from app.core.security import get_current_user
from app.database import get_db
from app.models import HistoryChange, Scrobble, Track, User
from app.routers.library import _track_dict
from app.services.cache import invalidate_all
from app.services.listen_status import listen_status

router = APIRouter(tags=["library"])
DB = Annotated[Session, Depends(get_db)]
Owner = Annotated[User, Depends(get_current_user)]
ERRORS: dict[int | str, dict[str, Any]] = {404: {"description": "Item not found in own history"}, 409: {"description": "Change expired or modified again"}, 422: {"description": "Invalid filter or change"}}


class BatchChange(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    action: Literal["exclude", "restore", "delete", "edit"]
    title: str | None = Field(default=None, min_length=1, max_length=300)
    artist: str | None = Field(default=None, min_length=1, max_length=300)
    album: str | None = Field(default=None, max_length=300)


def _owned_rows(db, user, data):
    ids = set(data.ids)
    rows = db.query(Scrobble).execution_options(include_excluded=True).filter(
        Scrobble.user_id == user.id, Scrobble.id.in_(ids)).order_by(Scrobble.id).with_for_update().all()
    if len(rows) != len(ids):
        raise HTTPException(404, "Часть записей не найдена в вашей истории")
    if data.action == "edit" and not any(value and value.strip() for value in (data.title, data.artist, data.album)):
        raise HTTPException(422, "Укажите новые метаданные")
    return rows


def _snapshot(row):
    return {"track_id": int(row.track_id), "excluded": bool(row.excluded_from_stats),
            "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None}


def _apply(row, data, db):
    if data.action == "edit":
        original = row.track
        values = {"title": (data.title or original.title).strip(), "artist": (data.artist or original.artist).strip(),
                  "album": data.album.strip() if data.album is not None else original.album}
        if not values["title"] or not values["artist"]:
            raise HTTPException(422, "Название и исполнитель не могут быть пустыми")
        track = db.query(Track).filter_by(**values).first()
        if not track:
            track = Track(**values, duration=original.duration, genre=original.genre,
                          cover_url=original.cover_url, track_url=original.track_url)
            db.add(track)
            db.flush()
        row.track_id = track.id
    else:
        row.excluded_from_stats = data.action != "restore"
        if data.action == "delete":
            row.deleted_at = datetime.now(UTC)


@router.get("/api/me/history", responses=ERRORS)
def history_page(db: DB, user: Owner, q: Annotated[str, Query(max_length=100)] = "",
                 source: Annotated[str, Query(max_length=100)] = "", start: datetime | None = None,
                 end: datetime | None = None, status: Literal["all", "excluded", "counted", "incomplete", "metadata"] = "all",
                 cursor: Annotated[str | None, Query(max_length=120)] = None,
                 limit: Annotated[int, Query(ge=1, le=100)] = 50):
    query = db.query(Scrobble, Track).execution_options(include_excluded=True).join(Track).filter(Scrobble.user_id == user.id)
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Track.title.ilike(term), Track.artist.ilike(term), Track.album.ilike(term)))
    if source:
        query = query.filter(Scrobble.source == source)
    if start:
        query = query.filter(Scrobble.played_at >= start)
    if end:
        query = query.filter(Scrobble.played_at < end)
    if status == "excluded":
        query = query.filter(Scrobble.excluded_from_stats.is_(True))
    elif status == "counted":
        query = query.filter(Scrobble.excluded_from_stats.is_(False), Scrobble.listened_sec * 100 >= Track.duration * 85)
    elif status == "incomplete":
        query = query.filter(Scrobble.excluded_from_stats.is_(False), Scrobble.is_imported.isnot(True), Scrobble.listened_sec * 100 < Track.duration * 85)
    elif status == "metadata":
        query = query.filter(or_(Track.album.is_(None), Track.album == "", Track.artist == "", Track.title == ""))
    if cursor:
        try:
            when, row_id = cursor.rsplit("|", 1)
            stamp, last_id = datetime.fromisoformat(when), int(row_id)
        except ValueError as exc:
            raise HTTPException(422, "Некорректный курсор") from exc
        query = query.filter(tuple_(Scrobble.played_at, Scrobble.id) < tuple_(literal(stamp), literal(last_id)))
    rows = query.order_by(Scrobble.played_at.desc(), Scrobble.id.desc()).limit(limit + 1).all()
    visible = rows[:limit]
    last = visible[-1][0] if len(rows) > limit else None
    return {"items": [{"id": int(row.id), "played_at": row.played_at, "source": row.source,
                       "confirmed_sources": row.confirmed_sources or [row.source], "excluded_from_stats": bool(row.excluded_from_stats),
                       "status": listen_status(row, track), "track": _track_dict(track)} for row, track in visible],
            "next_cursor": f"{last.played_at.isoformat()}|{last.id}" if last else None}


@router.post("/api/me/history/preview", responses=ERRORS)
def preview_change(data: BatchChange, db: DB, user: Owner):
    rows = _owned_rows(db, user, data)
    return {"count": len(rows), "action": data.action, "undo_hours": 24,
            "sample": [{"id": row.id, "artist": row.track.artist, "title": row.track.title} for row in rows[:10]]}


@router.post("/api/me/history/apply", responses=ERRORS)
@limiter.limit("10/minute", key_func=credential_key)
def apply_change(request: Request, data: BatchChange, db: DB, user: Owner):
    rows = _owned_rows(db, user, data)
    payload = []
    for row in rows:
        before = _snapshot(row)
        _apply(row, data, db)
        payload.append({"id": row.id, "before": before, "after": _snapshot(row)})
    change = HistoryChange(id=uuid4().hex, user_id=user.id, payload=payload, expires_at=datetime.now(UTC) + timedelta(hours=24))
    db.add(change)
    db.commit()
    invalidate_all()
    return {"count": len(rows), "undo_id": change.id, "expires_at": change.expires_at}


@router.post("/api/me/history/undo/{change_id}", responses=ERRORS)
def undo_change(change_id: str, db: DB, user: Owner):
    change = db.query(HistoryChange).filter_by(id=change_id, user_id=user.id).with_for_update().first()
    if not change:
        raise HTTPException(404, "Изменение не найдено")
    expiry = change.expires_at.replace(tzinfo=UTC) if change.expires_at.tzinfo is None else change.expires_at
    if change.undone or expiry <= datetime.now(UTC):
        raise HTTPException(409, "Изменение уже отменено или срок отмены истёк")
    payload = cast(list[dict[str, Any]], change.payload)
    rows = db.query(Scrobble).execution_options(include_excluded=True, include_deleted=True).filter(
        Scrobble.user_id == user.id, Scrobble.id.in_([item["id"] for item in payload])).with_for_update().all()
    by_id = {row.id: row for row in rows}
    for item in payload:
        row = by_id.get(item["id"])
        # SQLite strips timezone information; compare deletion presence, not its string encoding.
        current = _snapshot(row) if row else None
        expected = item["after"]
        if current is None or current["track_id"] != expected["track_id"] or current["excluded"] != expected["excluded"] or bool(current["deleted_at"]) != bool(expected["deleted_at"]):
            raise HTTPException(409, "Запись изменена снова. Отмена не затронет новые изменения")
    for item in payload:
        row = by_id[item["id"]]
        row.track_id = item["before"]["track_id"]
        row.excluded_from_stats = item["before"]["excluded"]
        row.deleted_at = datetime.fromisoformat(item["before"]["deleted_at"]) if item["before"]["deleted_at"] else None  # type: ignore[assignment]
    change.undone = True  # type: ignore[assignment]
    db.commit()
    invalidate_all()
    return {"count": len(rows)}
