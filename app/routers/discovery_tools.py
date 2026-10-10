"""Private saved music and recommendation exposure history."""
from datetime import UTC, datetime
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, exists, func, literal, or_, select, tuple_
from sqlalchemy.orm import Session, joinedload
from app.core.security import get_current_user
from app.database import get_db
from app.models import ListenLater, RecommendationFeedback, RecommendationImpression, Scrobble, Track, User
from app.routers.library import _track_dict
from app.services.privacy import public_statistics_users, public_feed_user_ids

router = APIRouter(tags=["discovery"])
DB = Annotated[Session, Depends(get_db)]
Owner = Annotated[User, Depends(get_current_user)]


class SaveTrack(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class Impressions(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=50)


def accessible_track_ids(db, user, ids):
    public_ids = set(public_statistics_users(db).values()) & set(public_feed_user_ids(db))
    rows = db.query(Scrobble.track_id).execution_options(include_excluded=True).filter(
        Scrobble.track_id.in_(ids),
        or_(Scrobble.user_id == user.id, and_(Scrobble.user_id.in_(public_ids), Scrobble.excluded_from_stats.is_(False)))).distinct().all()
    return {int(row[0]) for row in rows}


@router.put("/api/me/listen-later/{track_id}", responses={404: {"description": "Track not found"}})
def save_track(track_id: int, data: SaveTrack, db: DB, user: Owner):
    if track_id not in accessible_track_ids(db, user, [track_id]):
        raise HTTPException(404, "Трек не найден")
    # User lock prevents racing two first saves against the unique constraint.
    db.query(User.id).filter(User.id == user.id).with_for_update().first()
    row = db.query(ListenLater).filter_by(user_id=user.id, track_id=track_id).first()
    if row:
        if data.note is not None:
            row.note = data.note  # type: ignore[assignment]
    else:
        row = ListenLater(user_id=user.id, track_id=track_id, note=data.note or "")
        db.add(row)
    db.commit()
    return {"id": row.id, "saved": True}


@router.get("/api/me/listen-later")
def saved_tracks(db: DB, user: Owner, before: int | None = None, limit: Annotated[int, Query(ge=1, le=100)] = 50):
    played = exists(select(Scrobble.id).join(Track, Track.id == Scrobble.track_id).where(
        Scrobble.user_id == user.id, Scrobble.track_id == ListenLater.track_id,
        Scrobble.played_at >= ListenLater.created_at, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85))
    query = db.query(ListenLater, played.label("heard"), RecommendationFeedback.value).options(joinedload(ListenLater.track)).outerjoin(
        RecommendationFeedback, (RecommendationFeedback.user_id == user.id) & (RecommendationFeedback.track_id == ListenLater.track_id)).filter(ListenLater.user_id == user.id)
    if before:
        query = query.filter(ListenLater.id < before)
    rows = query.order_by(ListenLater.id.desc()).limit(limit + 1).all()
    visible = rows[:limit]
    return {"items": [{"id": row.id, "note": row.note, "saved_at": row.created_at, "heard": bool(heard),
                       "feedback": feedback, "track": _track_dict(row.track)} for row, heard, feedback in visible],
            "next_cursor": visible[-1][0].id if len(rows) > limit else None}


@router.delete("/api/me/listen-later/{track_id}")
def remove_saved(track_id: int, db: DB, user: Owner):
    db.query(ListenLater).filter_by(user_id=user.id, track_id=track_id).delete(synchronize_session=False)
    db.commit()
    return {"saved": False}


@router.post("/api/me/recommendations/impressions")
def record_impressions(data: Impressions, db: DB, user: Owner):
    db.query(User.id).filter(User.id == user.id).with_for_update().first()
    ids = accessible_track_ids(db, user, set(data.ids))
    existing = {row.track_id: row for row in db.query(RecommendationImpression).filter(
        RecommendationImpression.user_id == user.id, RecommendationImpression.track_id.in_(ids)).all()}
    now = datetime.now(UTC)
    for track_id in ids:
        if track_id in existing:
            existing[track_id].shown_at = now  # type: ignore[assignment]
        else:
            db.add(RecommendationImpression(user_id=user.id, track_id=track_id, shown_at=now))
    db.commit()
    return {"recorded": len(ids)}


@router.get("/api/me/recommendations/history")
def recommendation_history(db: DB, user: Owner, before: Annotated[str | None, Query(max_length=120)] = None):
    query = db.query(RecommendationImpression).options(joinedload(RecommendationImpression.track)).filter_by(user_id=user.id)
    if before:
        try:
            stamp, row_id = before.rsplit("|", 1)
            when, last_id = datetime.fromisoformat(stamp), int(row_id)
        except ValueError as exc:
            raise HTTPException(422, "Некорректный курсор") from exc
        query = query.filter(tuple_(RecommendationImpression.shown_at, RecommendationImpression.id) < tuple_(literal(when), literal(last_id)))
    rows = query.order_by(RecommendationImpression.shown_at.desc(), RecommendationImpression.id.desc()).limit(51).all()
    return {"items": [{"id": row.id, "shown_at": row.shown_at, "track": _track_dict(row.track)} for row in rows[:50]],
            "next_cursor": f"{rows[49].shown_at.isoformat()}|{rows[49].id}" if len(rows) > 50 else None}
