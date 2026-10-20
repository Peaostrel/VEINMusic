"""Bounded, previewed personal-history transfer with no rewards or live events."""
import csv
import hashlib
import hmac
import io
import json
import time
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.rate_limit import credential_key, limiter
from app.core.security import SECRET_KEY, get_current_user
from app.database import get_db
from app.models import Scrobble, Track, User
from app.routers.account import export_history
from app.services.cache import invalidate_user

router = APIRouter(tags=["account"])
DB = Annotated[Session, Depends(get_db)]
Owner = Annotated[User, Depends(get_current_user)]
CSV_FIELDS = ["played_at", "artist", "title", "album", "duration", "source", "listened_sec", "excluded_from_stats"]
ERRORS: dict[int | str, dict[str, Any]] = {422: {"description": "Invalid history or expired preview"}}


class HistoryItem(BaseModel):
    played_at: datetime
    artist: str = Field(min_length=1, max_length=300)
    title: str = Field(min_length=1, max_length=300)
    album: str | None = Field(default=None, max_length=300)
    duration: int = Field(default=0, ge=0, le=86400)
    source: str = Field(default="transfer", max_length=100)
    listened_sec: int = Field(default=0, ge=0, le=86400)
    excluded_from_stats: bool = False

    @field_validator("artist", "title")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Укажите название и исполнителя")
        return value.strip()

    @field_validator("played_at")
    @classmethod
    def valid_date(cls, value):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        value = value.astimezone(UTC)
        if value < datetime(2000, 1, 1, tzinfo=UTC) or value > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError("Дата должна быть между 2000 годом и текущим временем")
        return value


class HistoryTransfer(BaseModel):
    scrobbles: list[HistoryItem] = Field(min_length=1, max_length=5000)
    preview_token: str = Field(default="", max_length=100)


def _signature(data, user_id, expiry):
    payload = json.dumps([item.model_dump(mode="json") for item in data.scrobbles], sort_keys=True)
    message = f"history-transfer:{user_id}:{expiry}:{payload}".encode()
    return hmac.new(SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def _key(played_at, artist, title):
    if played_at.tzinfo is None:
        played_at = played_at.replace(tzinfo=UTC)
    return (played_at.astimezone(UTC).isoformat(), artist.strip().casefold(), title.strip().casefold())


def _new_items(db, user_id, items):
    first = min(item.played_at for item in items)
    last = max(item.played_at for item in items)
    rows = db.query(Scrobble.played_at, Track.artist, Track.title).execution_options(
        include_excluded=True, include_deleted=True).join(Track).filter(
        Scrobble.user_id == user_id, Scrobble.played_at >= first, Scrobble.played_at <= last).yield_per(500)
    wanted = {_key(item.played_at, item.artist, item.title) for item in items}
    # Memory stays proportional to this upload, even for a huge existing history.
    seen = {_key(when, artist, title) for when, artist, title in rows if _key(when, artist, title) in wanted}
    result = []
    for item in items:
        key = _key(item.played_at, item.artist, item.title)
        if key not in seen:
            result.append(item)
            seen.add(key)
    return result


@router.post("/api/account/history/preview", responses=ERRORS)
@limiter.limit("30/hour", key_func=credential_key)
def preview_history(request: Request, data: HistoryTransfer, db: DB, user: Owner):
    items = _new_items(db, int(user.id), data.scrobbles)
    expiry = int(time.time()) + 900
    return {"new": len(items), "duplicates": len(data.scrobbles) - len(items),
            "sample": [item.model_dump(mode="json") for item in items[:5]],
            "preview_token": f"{expiry}.{_signature(data, user.id, expiry)}"}


def _valid_preview(data, user_id):
    try:
        expiry, signature = data.preview_token.split(".", 1)
        timestamp = int(expiry)
    except ValueError:
        return False
    return int(time.time()) <= timestamp <= int(time.time()) + 900 and hmac.compare_digest(
        signature, _signature(data, user_id, timestamp))


def _insert_history(db, user_id, items):
    for item in items:
        track = db.query(Track).filter_by(
            title=item.title, artist=item.artist, album=item.album, duration=item.duration).first()
        if not track:
            track = Track(title=item.title, artist=item.artist, album=item.album, duration=item.duration)
            db.add(track)
            db.flush()
        db.add(Scrobble(user_id=user_id, track_id=track.id, played_at=item.played_at,
                        updated_at=item.played_at, source=item.source or "transfer", listened_sec=item.listened_sec,
                        xp_earned=0, is_imported=True, is_playing=False,
                        excluded_from_stats=item.excluded_from_stats))


@router.post("/api/account/history/import", responses=ERRORS)
@limiter.limit("20/hour", key_func=credential_key)
def import_history(request: Request, data: HistoryTransfer, db: DB, user: Owner):
    if not _valid_preview(data, user.id):
        raise HTTPException(422, "Предпросмотр устарел или данные изменились. Проверьте файл снова.")
    # Serialize concurrent imports from the same account before deduplication.
    db.query(User.id).filter(User.id == user.id).with_for_update().first()
    items = _new_items(db, int(user.id), data.scrobbles)
    _insert_history(db, int(user.id), items)
    db.commit()
    invalidate_user(str(user.username))
    return {"imported": len(items), "duplicates": len(data.scrobbles) - len(items)}


def _csv_cell(value):
    text = "" if value is None else str(value)
    # Quoting alone does not stop spreadsheet formulas in downloaded CSV.
    return "'" + text if text.startswith(("=", "+", "-", "@", "\t", "\r", "\n")) else text


def stream_csv(bind, user_id, start=None, end=None):
    with Session(bind=bind) as session:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(CSV_FIELDS)
        yield "\ufeff" + buffer.getvalue()
        for item in export_history(session, user_id, start, end):
            buffer.seek(0)
            buffer.truncate(0)
            writer.writerow([_csv_cell(item[key]) for key in CSV_FIELDS])
            yield buffer.getvalue()


@router.get("/api/account/history.csv", responses={422: {"description": "Invalid date range"}})
@limiter.limit("5/hour", key_func=credential_key)
def export_csv(request: Request, db: DB, user: Owner, date_from: date | None = None, date_to: date | None = None):
    from app.routers.experience import date_bounds

    try:
        start, end = date_bounds(user, date_from, date_to)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return StreamingResponse(stream_csv(db.get_bind(), int(user.id), start, end), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="veinmusic-history.csv"',
                                      "Cache-Control": "no-store"})
