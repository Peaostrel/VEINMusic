"""Admin panel: users' scrobbles (browse, fix, delete, bulk delete),
linked services with the Yandex live connection state, the showcase and
user reports."""
from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Query as SAQuery, Session

from app.core.constants import USER_NOT_FOUND
from app.core.security import get_admin_user
from app.database import get_db
from app.models import Scrobble, Track, User
from app.services import audit, cache

router = APIRouter(prefix="/api/admin", tags=["admin"])

AdminUser = Annotated[User, Depends(get_admin_user)]
DB = Annotated[Session, Depends(get_db)]

SCROBBLE_NOT_FOUND = "Прослушивание не найдено"
# Deleting more than this at once has to be split into smaller periods
BULK_DELETE_MAX = 5000


def _counted(scrobble: Scrobble, track: Track) -> bool:
    length = int(track.duration or 0) or 180
    return int(scrobble.listened_sec or 0) * 100 >= length * 85


def _start(day: date | None) -> datetime | None:
    return datetime.combine(day, time.min, UTC) if day else None


def _end(day: date | None) -> datetime | None:
    return datetime.combine(day + timedelta(days=1), time.min, UTC) if day else None


def _filtered(db: Session, *, username: str | None, q: str | None, source: str | None,
              date_from: date | None, date_to: date | None) -> SAQuery:
    query = db.query(Scrobble, Track, User.username) \
        .join(Track, Track.id == Scrobble.track_id).join(User, User.id == Scrobble.user_id)
    if username:
        query = query.filter(User.username == username)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Track.title.ilike(like), Track.artist.ilike(like)))
    if source:
        query = query.filter(Scrobble.source == source)
    if date_from:
        query = query.filter(Scrobble.played_at >= _start(date_from))
    if date_to:
        query = query.filter(Scrobble.played_at < _end(date_to))
    return query


def _item(scrobble: Scrobble, track: Track, username: str) -> dict[str, Any]:
    return {
        "id": scrobble.id,
        "username": username,
        "track_id": track.id,
        "title": track.title,
        "artist": track.artist,
        "cover_url": track.cover_url,
        "duration": int(track.duration or 0),
        "source": scrobble.source,
        "played_at": scrobble.played_at.isoformat() if scrobble.played_at else None,
        "listened_sec": int(scrobble.listened_sec or 0),
        "xp_earned": int(scrobble.xp_earned or 0),
        "counted": _counted(scrobble, track),
        "is_imported": bool(scrobble.is_imported),
    }


def _changed(db: Session) -> None:
    db.commit()
    # Stats, leaderboard, feeds and profiles are all built from scrobbles
    cache.clear_all()


@router.get("/scrobbles")
def list_scrobbles(
    db: DB, admin: AdminUser,
    username: Annotated[str | None, Query(max_length=64)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    source: Annotated[str | None, Query(max_length=32)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Scrobbles, newest first, filtered by user, text, source and period."""
    query = _filtered(db, username=username, q=q, source=source, date_from=date_from, date_to=date_to)
    total = query.count()
    rows = query.order_by(Scrobble.played_at.desc(), Scrobble.id.desc()).offset(offset).limit(limit).all()
    sources = [s for (s,) in db.query(Scrobble.source).distinct().order_by(Scrobble.source) if s]
    return {"total": total, "sources": sources, "items": [_item(s, t, u) for s, t, u in rows]}


class ScrobbleFix(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    artist: str = Field(min_length=1, max_length=300)


@router.put("/scrobbles/{scrobble_id}", responses={404: {"description": SCROBBLE_NOT_FOUND}})
def fix_scrobble(scrobble_id: int, data: ScrobbleFix, db: DB, admin: AdminUser):
    """Point a scrobble at another track (a wrong title or artist from the
    player). The track is found in the catalog or added to it."""
    from app.services.scrobble_processor import _find_or_create_track

    scrobble = db.query(Scrobble).filter(Scrobble.id == scrobble_id).first()
    if not scrobble:
        raise HTTPException(404, SCROBBLE_NOT_FOUND)
    old = db.query(Track).filter(Track.id == scrobble.track_id).first()
    track, _ = _find_or_create_track(db, data.title.strip(), data.artist.strip(), "", "", 0, "")
    owner = db.query(User.username).filter(User.id == scrobble.user_id).scalar()
    audit.record(db, admin, "scrobble.fix", owner, scrobble_id=scrobble_id,
                 old=f"{old.artist} — {old.title}" if old else None,
                 new=f"{track.artist} — {track.title}")
    scrobble.track_id = track.id  # type: ignore[assignment]
    _changed(db)
    return {"status": "ok", "track_id": track.id, "title": track.title, "artist": track.artist}


@router.delete("/scrobbles/{scrobble_id}", responses={404: {"description": SCROBBLE_NOT_FOUND}})
def delete_scrobble(scrobble_id: int, db: DB, admin: AdminUser):
    """Delete one scrobble; its likes, comments and notifications go with it
    and the owner's XP drops by what it earned."""
    row = db.query(Scrobble, Track).join(Track, Track.id == Scrobble.track_id) \
        .filter(Scrobble.id == scrobble_id).first()
    if not row:
        raise HTTPException(404, SCROBBLE_NOT_FOUND)
    scrobble, track = row
    owner = db.query(User.username).filter(User.id == scrobble.user_id).scalar()
    audit.record(db, admin, "scrobble.delete", owner, scrobble_id=scrobble_id,
                 track=f"{track.artist} — {track.title}", xp=int(scrobble.xp_earned or 0))
    db.delete(scrobble)
    _changed(db)
    return {"status": "ok"}


class BulkDelete(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    q: str | None = Field(default=None, max_length=100)
    source: str | None = Field(default=None, max_length=32)
    date_from: date | None = None
    date_to: date | None = None
    # Count only: the panel shows how many would go before deleting
    dry_run: bool = True


@router.post("/scrobbles/bulk-delete", responses={
    400: {"description": "Too many scrobbles at once"}, 404: {"description": USER_NOT_FOUND}})
def bulk_delete_scrobbles(data: BulkDelete, db: DB, admin: AdminUser):
    """Delete one user's scrobbles matching the filters (for example the
    phantom plays left by a bug). Always limited to one user."""
    if not db.query(User.id).filter(User.username == data.username).first():
        raise HTTPException(404, USER_NOT_FOUND)
    query = _filtered(db, username=data.username, q=data.q, source=data.source,
                      date_from=data.date_from, date_to=data.date_to)
    matched = query.count()
    xp = int(query.with_entities(func.coalesce(func.sum(Scrobble.xp_earned), 0)).scalar() or 0)
    result = {"matched": matched, "xp": xp, "deleted": 0}
    if data.dry_run or not matched:
        return result
    if matched > BULK_DELETE_MAX:
        raise HTTPException(400, f"За раз можно удалить не больше {BULK_DELETE_MAX} прослушиваний: сузьте период")
    ids = [i for (i,) in query.with_entities(Scrobble.id).all()]
    audit.record(db, admin, "scrobble.bulk_delete", data.username, count=len(ids), xp=xp,
                 q=data.q, source=data.source, date_from=data.date_from, date_to=data.date_to)
    # Row by row, so likes, comments and notifications cascade in every database
    for scrobble in db.query(Scrobble).filter(Scrobble.id.in_(ids)):
        db.delete(scrobble)
    _changed(db)
    result["deleted"] = len(ids)
    return result


# ─── INTEGRATIONS ─────────────────────────────────────────────────────────────

PROVIDERS = ("yandex", "spotify", "lastfm")


async def _live_status() -> tuple[dict[int, dict[str, Any]], int | None, bool]:
    """(Yandex live state by user id, worker heartbeat in ms, Redis reachable)."""
    import json

    from app.core.redis import get_redis_client
    from app.services.yandex_live import HEARTBEAT_KEY, STATUS_KEY
    try:
        client = get_redis_client()
        raw = await client.hgetall(STATUS_KEY)
        heartbeat = await client.get(HEARTBEAT_KEY)
    except Exception:
        return {}, None, False
    status = {}
    for uid, value in (raw or {}).items():
        try:
            status[int(uid)] = json.loads(value)
        except (TypeError, ValueError):
            continue
    return status, int(heartbeat) if heartbeat else None, True


def _integration_rows(db: Session, q: str | None, provider: str | None):
    from app.models import UserIntegration

    query = db.query(User, UserIntegration).join(UserIntegration, UserIntegration.user_id == User.id)
    conditions = {
        "yandex": UserIntegration.yandex_token.isnot(None),
        "spotify": UserIntegration.spotify_refresh_token.isnot(None),
        # The settings form saves an empty nick as ""
        "lastfm": and_(UserIntegration.lastfm_username.isnot(None), UserIntegration.lastfm_username != ""),
    }
    query = query.filter(conditions[provider] if provider else or_(*conditions.values()))
    if q:
        query = query.filter(User.username.ilike(f"%{q}%"))
    return query


@router.get("/integrations")
async def list_integrations(
    db: DB, admin: AdminUser,
    q: Annotated[str | None, Query(max_length=64)] = None,
    provider: Annotated[str | None, Query(pattern="^(yandex|spotify|lastfm)$")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Users with a linked service, the state of their Yandex live
    connection (kept by the worker) and when they last scrobbled."""
    live, heartbeat, redis_ok = await _live_status()
    query = _integration_rows(db, q, provider)
    total = query.count()
    rows = query.order_by(User.username).offset(offset).limit(limit).all()
    ids = [int(u.id) for u, _ in rows]
    last_played: dict[int, datetime] = {
        int(uid): played for uid, played in db.query(Scrobble.user_id, func.max(Scrobble.played_at))
        .filter(Scrobble.user_id.in_(ids)).group_by(Scrobble.user_id)} if ids else {}
    return {
        "total": total,
        "redis": redis_ok,
        "worker_heartbeat_ms": heartbeat,
        # "N seconds ago" in the panel is counted from here
        "now_ms": int(datetime.now(UTC).timestamp() * 1000),
        "items": [{
            "username": u.username,
            "avatar_url": u.profile.avatar_url if u.profile else None,
            "is_banned": bool(u.is_banned),
            "yandex": bool(i.yandex_token),
            "yandex_live": live.get(int(u.id)),
            "spotify": bool(i.spotify_refresh_token),
            "lastfm_username": i.lastfm_username,
            "last_sync": i.last_sync.isoformat() if i.last_sync else None,
            "last_scrobble": last_played[int(u.id)].isoformat() if last_played.get(int(u.id)) else None,
        } for u, i in rows],
    }


def _user_with_integration(db: Session, username: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.integration:
        raise HTTPException(404, USER_NOT_FOUND)
    return user


@router.post("/integrations/{username}/yandex/reconnect", responses={
    400: {"description": "Yandex Music is not linked"}, 404: {"description": USER_NOT_FOUND},
    503: {"description": "Redis is unavailable"}})
async def reconnect_yandex(username: str, db: DB, admin: AdminUser):
    """Ask the worker to reopen the user's Ynison connection."""
    from app.core.redis import get_redis_client
    from app.services.yandex_live import RESTART_KEY

    user = _user_with_integration(db, username)
    if not user.integration.yandex_token:
        raise HTTPException(400, "Яндекс Музыка не подключена")
    try:
        await get_redis_client().sadd(RESTART_KEY, str(user.id))
    except Exception as e:
        raise HTTPException(503, "Redis недоступен: воркер не получит запрос") from e
    audit.record(db, admin, "integration.reconnect", username, provider="yandex")
    db.commit()
    return {"status": "ok"}


@router.delete("/integrations/{username}/{provider}", responses={404: {"description": USER_NOT_FOUND}})
def unlink_integration(
    username: str, db: DB, admin: AdminUser,
    provider: Annotated[str, Path(pattern="^(yandex|spotify|lastfm)$")],
):
    """Unlink a service (a broken or abused token). The user can link it
    again in their settings."""
    integration = _user_with_integration(db, username).integration
    if provider == "yandex":
        integration.yandex_token = None
    elif provider == "spotify":
        integration.spotify_access_token = None
        integration.spotify_refresh_token = None
    else:
        integration.lastfm_username = None
    audit.record(db, admin, "integration.unlink", username, provider=provider)
    db.commit()
    return {"status": "ok"}


# ─── SHOWCASE ─────────────────────────────────────────────────────────────────

class ShowcaseUnlock(BaseModel):
    field: str = Field(pattern="^(artist|track|album|all)$")


def _profile_of(db: Session, username: str):
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.profile:
        raise HTTPException(404, USER_NOT_FOUND)
    return user.profile


@router.post("/users/{username}/showcase/refresh", responses={404: {"description": USER_NOT_FOUND}})
async def refresh_showcase(username: str, db: DB, admin: AdminUser):
    """Look the favorites up again (name, picture, link); locks stay."""
    from app.routers.profile import refresh_favorites

    changed = await refresh_favorites(_profile_of(db, username))
    audit.record(db, admin, "showcase.refresh", username, changed=changed)
    db.commit()
    cache.clear_all()
    return {"changed": changed}


@router.post("/users/{username}/showcase/unlock", responses={404: {"description": USER_NOT_FOUND}})
def unlock_showcase(username: str, data: ShowcaseUnlock, db: DB, admin: AdminUser):
    """Lift the 30-day lock so the user can pick another favorite now."""
    profile = _profile_of(db, username)
    fields = ("artist", "track", "album") if data.field == "all" else (data.field,)
    for kind in fields:
        setattr(profile, f"favorite_{kind}_updated_at", None)
    audit.record(db, admin, "showcase.unlock", username, fields=list(fields))
    db.commit()
    return {"status": "ok"}


# ─── REPORTS ──────────────────────────────────────────────────────────────────

REPORT_NOT_FOUND = "Жалоба не найдена"


@router.get("/reports")
def list_reports(
    db: DB, admin: AdminUser,
    status: Annotated[str, Query(pattern="^(open|resolved|dismissed|all)$")] = "open",
    target_type: Annotated[str | None, Query(pattern="^(user|comment)$")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Reports, newest first; `open_count` feeds the tab badge."""
    from app.models import Report, ScrobbleComment

    query = db.query(Report)
    if status != "all":
        query = query.filter(Report.status == status)
    if target_type == "user":
        query = query.filter(Report.comment_text.is_(None))
    elif target_type == "comment":
        query = query.filter(Report.comment_text.isnot(None))
    total = query.count()
    rows = query.order_by(Report.id.desc()).offset(offset).limit(limit).all()

    user_ids = {r.reporter_id for r in rows} | {r.target_user_id for r in rows}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids))} if user_ids else {}
    comment_ids = {r.comment_id for r in rows if r.comment_id}
    live_comments = {c for (c,) in db.query(ScrobbleComment.id).filter(ScrobbleComment.id.in_(comment_ids))} \
        if comment_ids else set()
    # How many open reports each target has: several people flagging the same thing matters
    open_by_target: dict[int, int] = {
        int(uid): int(n) for uid, n in db.query(Report.target_user_id, func.count(Report.id))
        .filter(Report.status == "open").group_by(Report.target_user_id)}

    def person(uid):
        u = users.get(uid)
        return {"username": u.username, "is_banned": bool(u.is_banned)} if u else None

    return {
        "total": total,
        "open_count": db.query(func.count(Report.id)).filter(Report.status == "open").scalar() or 0,
        "items": [{
            "id": r.id,
            "type": "comment" if r.comment_text is not None else "user",
            "reporter": person(r.reporter_id),
            "target": person(r.target_user_id),
            "target_open_reports": int(open_by_target.get(int(r.target_user_id), 0)),
            "comment": {"id": r.comment_id, "text": r.comment_text,
                        "exists": r.comment_id in live_comments} if r.comment_text is not None else None,
            "reason": r.reason,
            "details": r.details,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "resolved_by": r.resolved_by,
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            "resolution": r.resolution,
        } for r in rows],
    }


class ReportResolve(BaseModel):
    status: str = Field(pattern="^(resolved|dismissed)$")
    resolution: str | None = Field(default=None, max_length=300)
    # Remove the reported comment together with closing the report
    delete_comment: bool = False


@router.post("/reports/{report_id}/resolve", responses={404: {"description": REPORT_NOT_FOUND}})
def resolve_report(report_id: int, data: ReportResolve, db: DB, admin: AdminUser):
    """Close a report and every other open report about the same profile or
    comment, optionally deleting the comment."""
    from app.models import Report, ScrobbleComment

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, REPORT_NOT_FOUND)
    same = db.query(Report).filter(Report.status == "open", Report.target_user_id == report.target_user_id)
    same = same.filter(Report.comment_id == report.comment_id) if report.comment_id \
        else same.filter(Report.comment_text.is_(None))
    closing = {r.id: r for r in same}
    closing[report.id] = report
    now = datetime.now(UTC)
    for r in closing.values():
        r.status = data.status  # type: ignore[assignment]
        r.resolved_by = str(admin.username)[:64]  # type: ignore[assignment]
        r.resolved_at = now  # type: ignore[assignment]
        r.resolution = data.resolution  # type: ignore[assignment]
    target = db.query(User.username).filter(User.id == report.target_user_id).scalar()
    deleted = False
    if data.delete_comment and report.comment_id:
        comment = db.query(ScrobbleComment).filter(ScrobbleComment.id == report.comment_id).first()
        if comment:
            audit.record(db, admin, "comment.delete", target, text=str(comment.content or "")[:200],
                         report_id=report.id)
            db.delete(comment)
            deleted = True
    audit.record(db, admin, "report.resolve", target, status=data.status, reports=sorted(closing),
                 resolution=data.resolution, comment_deleted=deleted)
    db.commit()
    if deleted:
        cache.clear_all()
    return {"status": "ok", "closed": len(closing), "comment_deleted": deleted}
