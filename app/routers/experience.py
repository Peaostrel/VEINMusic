"""Owner library search and privacy-aware calendar drill-down."""
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.rate_limit import HEAVY_READ_LIMIT, limiter
from app.core.security import get_current_user
from app.database import get_db
from app.models import ListenLater, Scrobble, Track, User
from app.routers.common import _get_visible_user
from app.routers.library import _track_dict
from app.routers.stats import _counted_filter, _user_timezone

router = APIRouter(tags=["library"])
DB = Annotated[Session, Depends(get_db)]
Owner = Annotated[User, Depends(get_current_user)]


def date_bounds(user, start, end):
    if start and end and start > end:
        raise ValueError("Начало периода не может быть позже конца")
    zone = _user_timezone(user)
    lower = datetime.combine(start, datetime.min.time(), zone).astimezone(UTC) if start else None
    upper = datetime.combine(end + timedelta(days=1), datetime.min.time(), zone).astimezone(UTC) if end else None
    return lower, upper


def _search_filters(user, q, source, lower, upper):
    filters = [Scrobble.user_id == user.id]
    if q.strip():
        # Escape LIKE wildcards so typing % searches for a literal percent.
        term = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        filters.append(or_(*(column.ilike(term, escape="\\") for column in (Track.title, Track.artist, Track.album))))
    if source:
        filters.append(Scrobble.source == source)
    if lower:
        filters.append(Scrobble.played_at >= lower)
    if upper:
        filters.append(Scrobble.played_at < upper)
    return filters


@router.get("/api/me/library/search", responses={422: {"description": "Invalid date range"}})
def personal_search(db: DB, user: Owner,
                    q: Annotated[str, Query(max_length=100)] = "",
                    source: Annotated[str, Query(max_length=100)] = "",
                    date_from: date | None = None, date_to: date | None = None,
                    before: Annotated[int | None, Query(ge=1)] = None):
    try:
        lower, upper = date_bounds(user, date_from, date_to)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, str(exc)) from exc
    filters = _search_filters(user, q, source, lower, upper)
    history = db.query(Scrobble, Track).execution_options(include_excluded=True).join(Track).filter(*filters)
    if before:
        history = history.filter(Scrobble.id < before)
    rows = history.order_by(Scrobble.id.desc()).limit(31).all()
    plays = db.query(Scrobble.track_id, func.count(Scrobble.id).label("plays")).join(Track).filter(
        *filters).group_by(Scrobble.track_id).subquery()
    tracks = db.query(Track, plays.c.plays).join(plays, plays.c.track_id == Track.id).order_by(
        plays.c.plays.desc(), Track.id).limit(20).all()
    artists = db.query(Track.artist, func.sum(plays.c.plays)).join(plays, plays.c.track_id == Track.id).group_by(
        Track.artist).order_by(func.sum(plays.c.plays).desc(), Track.artist).limit(20).all()
    albums = db.query(Track.artist, Track.album, func.sum(plays.c.plays)).join(plays, plays.c.track_id == Track.id).filter(
        Track.album.isnot(None), Track.album != "").group_by(Track.artist, Track.album).order_by(
        func.sum(plays.c.plays).desc(), Track.album).limit(20).all()
    saved = db.query(ListenLater, Track).join(Track).filter(ListenLater.user_id == user.id)
    if q.strip():
        term = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        saved = saved.filter(or_(Track.title.ilike(term, escape="\\"), Track.artist.ilike(term, escape="\\"), Track.album.ilike(term, escape="\\")))
    if source or lower or upper:
        saved = saved.filter(ListenLater.track_id.in_(db.query(plays.c.track_id)))
    sources = db.query(Scrobble.source).execution_options(include_excluded=True).filter(
        Scrobble.user_id == user.id).distinct().order_by(Scrobble.source).all()
    return {"tracks": [_track_dict(track, count) for track, count in tracks],
            "artists": [{"artist": artist, "plays": int(count)} for artist, count in artists],
            "albums": [{"artist": artist, "album": album, "plays": int(count)} for artist, album, count in albums],
            "saved": [{"track": _track_dict(track), "note": row.note} for row, track in saved.order_by(ListenLater.id.desc()).limit(20)],
            "history": [{"id": row.id, "played_at": row.played_at, "source": row.source,
                         "excluded": bool(row.excluded_from_stats), "track": _track_dict(track)} for row, track in rows[:30]],
            "next": rows[29][0].id if len(rows) > 30 else None,
            "sources": [source for source, in sources if source]}


@router.get("/api/stats/calendar/{username}/range", responses={
    403: {"description": "History or statistics are private"},
    404: {"description": "User not found"}, 422: {"description": "Invalid date range"}})
@limiter.limit(HEAVY_READ_LIMIT)
def calendar_range(username: str, request: Request, db: DB,
                   date_from: date, date_to: date,
                   before: Annotated[int | None, Query(ge=1)] = None):
    user = _get_visible_user(username, request, db, "statistics")
    _get_visible_user(username, request, db, "history")
    try:
        if (date_to - date_from).days >= 366:
            raise ValueError("Выберите не больше 366 дней")
        lower, upper = date_bounds(user, date_from, date_to)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, str(exc)) from exc
    filters = _counted_filter(int(user.id), lower, upper)
    count, seconds = db.query(func.count(Scrobble.id), func.coalesce(func.sum(Scrobble.listened_sec), 0)).join(Track).filter(*filters).one()
    artists = db.query(Track.artist, func.count(Scrobble.id)).join(Scrobble).filter(*filters).group_by(
        Track.artist).order_by(func.count(Scrobble.id).desc(), Track.artist).limit(10).all()
    query = db.query(Scrobble, Track).join(Track).filter(*filters)
    if before:
        query = query.filter(Scrobble.id < before)
    rows = query.order_by(Scrobble.id.desc()).limit(51).all()
    return {"date_from": date_from, "date_to": date_to, "scrobbles": count, "minutes": int(seconds) // 60,
            "artists": [{"artist": artist, "plays": plays} for artist, plays in artists],
            "history": [{"id": row.id, "played_at": row.played_at, "source": row.source,
                         "track": _track_dict(track)} for row, track in rows[:50]],
            "next": rows[49][0].id if len(rows) > 50 else None}
