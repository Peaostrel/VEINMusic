"""Admin panel: users' scrobbles (browse, fix, delete, bulk delete),
linked services with the Yandex live connection state, the showcase and
user reports."""
from __future__ import annotations

import json
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any

import anyio
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Query as SAQuery, Session

from app.core.constants import USER_NOT_FOUND
from app.core.i18n import request_lang, tr, user_lang
from app.core.security import get_admin_user
from app.database import get_db
from app.models import (
    BlacklistFilter, FeatureFlag, Report, Scrobble, ScrobbleComment, Track, User, UserIntegration,
)
from app.services import audit, cache, runtime_settings

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
def bulk_delete_scrobbles(request: Request, data: BulkDelete, db: DB, admin: AdminUser):
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
        raise HTTPException(400, tr(request_lang(request, admin),
                                    "За раз можно удалить не больше {max} прослушиваний: сузьте период",
                                    max=BULK_DELETE_MAX))
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

PROVIDERS = ("yandex", "spotify", "soundcloud", "lastfm")
PROVIDER_FEATURES = {
    "yandex": "integration_yandex",
    "spotify": "integration_spotify",
    "soundcloud": "integration_soundcloud",
    "lastfm": "integration_lastfm",
}


class ProviderState(BaseModel):
    enabled: bool


async def _live_status() -> tuple[dict[int, dict[str, Any]], int | None, bool]:
    """(Yandex live state by user id, worker heartbeat in ms, Redis reachable)."""
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
    query = db.query(User, UserIntegration).join(UserIntegration, UserIntegration.user_id == User.id)
    conditions = {
        "yandex": UserIntegration.yandex_token.isnot(None),
        "spotify": UserIntegration.spotify_refresh_token.isnot(None),
        "soundcloud": UserIntegration.soundcloud_refresh_token.isnot(None),
        # The settings form saves an empty nick as ""
        "lastfm": and_(UserIntegration.lastfm_username.isnot(None), UserIntegration.lastfm_username != ""),
    }
    query = query.filter(conditions[provider] if provider else or_(*conditions.values()))
    if q:
        query = query.filter(User.username.ilike(f"%{q}%"))
    return query


@router.get("/integrations")
def list_integrations(
    db: DB, admin: AdminUser,
    q: Annotated[str | None, Query(max_length=64)] = None,
    provider: Annotated[str | None, Query(pattern="^(yandex|spotify|soundcloud|lastfm)$")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Users with a linked service, the state of their Yandex live
    connection (kept by the worker) and when they last scrobbled."""
    live, heartbeat, redis_ok = anyio.from_thread.run(_live_status)
    query = _integration_rows(db, q, provider)
    total = query.count()
    rows = query.order_by(User.username).offset(offset).limit(limit).all()
    ids = [int(u.id) for u, _ in rows]
    last_played: dict[int, datetime] = {
        int(uid): played for uid, played in db.query(Scrobble.user_id, func.max(Scrobble.played_at))
        .filter(Scrobble.user_id.in_(ids)).group_by(Scrobble.user_id)} if ids else {}
    flags = runtime_settings.feature_flags(db)
    linked_counts = {
        name: _integration_rows(db, None, name).count()
        for name in PROVIDERS
    }
    return {
        "total": total,
        "redis": redis_ok,
        "worker_heartbeat_ms": heartbeat,
        # "N seconds ago" in the panel is counted from here
        "now_ms": int(datetime.now(UTC).timestamp() * 1000),
        "providers": {
            name: {
                "enabled": flags.get(PROVIDER_FEATURES[name], True),
                "linked": linked_counts[name],
            }
            for name in PROVIDERS
        },
        "items": [{
            "username": u.username,
            "avatar_url": u.profile.avatar_url if u.profile else None,
            "is_banned": bool(u.is_banned),
            "yandex": bool(i.yandex_token),
            "yandex_live": live.get(int(u.id)),
            "spotify": bool(i.spotify_refresh_token),
            "soundcloud": bool(i.soundcloud_refresh_token),
            "lastfm_username": i.lastfm_username,
            "last_sync": i.last_sync.isoformat() if i.last_sync else None,
            "last_scrobble": last_played[int(u.id)].isoformat() if last_played.get(int(u.id)) else None,
        } for u, i in rows],
    }


@router.put("/integrations/providers/{provider}")
def set_provider_state(
    provider: Annotated[str, Path(pattern="^(yandex|spotify|soundcloud|lastfm)$")],
    data: ProviderState,
    db: DB,
    admin: AdminUser,
):
    """Pause or resume one provider without deleting any user's credentials."""
    key = PROVIDER_FEATURES[provider]
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if flag is None:
        flag = FeatureFlag(
            key=key,
            description=runtime_settings.KNOWN_FEATURES[key],
            is_enabled=data.enabled,
        )
        db.add(flag)
    else:
        flag.is_enabled = data.enabled  # type: ignore[assignment]
        flag.updated_at = datetime.now(UTC)  # type: ignore[assignment]
    audit.record(db, admin, "integration.provider_state", provider, enabled=data.enabled)
    db.commit()
    runtime_settings.invalidate()
    return {"provider": provider, "enabled": data.enabled}


def _user_with_integration(db: Session, username: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.integration:
        raise HTTPException(404, USER_NOT_FOUND)
    return user


@router.post("/integrations/{username}/yandex/reconnect", responses={
    400: {"description": "Yandex Music is not linked"}, 404: {"description": USER_NOT_FOUND},
    503: {"description": "Redis is unavailable"}})
def reconnect_yandex(username: str, db: DB, admin: AdminUser):
    """Ask the worker to reopen the user's Ynison connection."""
    from app.core.redis import get_redis_client
    from app.services.yandex_live import RESTART_KEY

    if not runtime_settings.is_feature_enabled("integration_yandex", db):
        raise HTTPException(503, "Яндекс Музыка приостановлена администратором")
    user = _user_with_integration(db, username)
    if not user.integration.yandex_token:
        raise HTTPException(400, "Яндекс Музыка не подключена")
    try:
        anyio.from_thread.run(get_redis_client().sadd, RESTART_KEY, str(user.id))
    except Exception as e:
        raise HTTPException(503, "Redis недоступен: воркер не получит запрос") from e
    audit.record(db, admin, "integration.reconnect", username, provider="yandex")
    db.commit()
    return {"status": "ok"}


@router.delete("/integrations/{username}/{provider}", responses={404: {"description": USER_NOT_FOUND}})
def unlink_integration(
    username: str, db: DB, admin: AdminUser,
    provider: Annotated[str, Path(pattern="^(yandex|spotify|soundcloud|lastfm)$")],
):
    """Unlink a service (a broken or abused token). The user can link it
    again in their settings."""
    integration = _user_with_integration(db, username).integration
    if provider == "yandex":
        integration.yandex_token = None
    elif provider == "spotify":
        integration.spotify_access_token = None
        integration.spotify_refresh_token = None
    elif provider == "soundcloud":
        integration.soundcloud_access_token = None
        integration.soundcloud_refresh_token = None
        integration.soundcloud_token_expires_at = None
        integration.soundcloud_recent_tracks = None
        integration.soundcloud_current_track = None
        integration.soundcloud_track_started_at = None
    else:
        integration.lastfm_username = None
        integration.lastfm_verified = False
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
def refresh_showcase(username: str, db: DB, admin: AdminUser):
    """Look the favorites up again (name, picture, link); locks stay."""
    from app.routers.profile import refresh_favorites

    changed = anyio.from_thread.run(refresh_favorites, _profile_of(db, username))
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


def _evidence(text) -> str:
    """Stands in for the id of a deleted target: what was reported."""
    import hashlib
    return hashlib.sha256(str(text).encode()).hexdigest()[:16]


def _report_key(r) -> str:
    """Reports about the same thing are decided together. A deleted target
    is told apart by what was reported (or not grouped at all)."""
    if r.target_type == "track":
        if r.track_id is not None:
            return f"track:{r.track_id}"
        return f"track:gone:{_evidence(r.target_snapshot)}" if r.target_snapshot else f"report:{r.id}"
    if r.target_type == "comment":
        if r.comment_id is not None:
            return f"comment:{r.comment_id}:{r.target_user_id}"
        return f"comment:gone:{r.target_user_id}:{_evidence(r.comment_text)}" if r.comment_text \
            else f"report:{r.id}"
    if r.target_user_id is not None:
        return f"user:{r.target_user_id}"
    return f"user:gone:{_evidence(r.target_snapshot)}" if r.target_snapshot else f"report:{r.id}"


def _same_target(query, report):
    """Open reports with the same `_report_key`."""
    query = query.filter(Report.target_type == report.target_type)
    if report.target_type == "track":
        if report.track_id is not None:
            return query.filter(Report.track_id == report.track_id)
        evidence = (Report.target_snapshot, report.target_snapshot)
        query = query.filter(Report.track_id.is_(None))
    elif report.target_type == "comment":
        query = query.filter(Report.target_user_id.is_not_distinct_from(report.target_user_id))
        if report.comment_id is not None:
            return query.filter(Report.comment_id == report.comment_id)
        evidence = (Report.comment_text, report.comment_text)
        query = query.filter(Report.comment_id.is_(None))
    else:
        if report.target_user_id is not None:
            return query.filter(Report.target_user_id == report.target_user_id)
        evidence = (Report.target_snapshot, report.target_snapshot)
        query = query.filter(Report.target_user_id.is_(None))
    column, value = evidence
    return query.filter(column == value) if value else query.filter(Report.id == report.id)


def _rank_by_priority(rows: list) -> list:
    """Targets reported by more people first, reports about one target
    together (few reports exist at a time: ranked in Python)."""
    reporters_by_key: dict[str, set] = {}
    newest_by_key: dict[str, int] = {}
    for r in rows:
        key = _report_key(r)
        reporters_by_key.setdefault(key, set()).add(r.reporter_id)
        newest_by_key[key] = max(newest_by_key.get(key, 0), int(r.id))
    return sorted(rows, key=lambda r: (-len(reporters_by_key[_report_key(r)]),
                                       -newest_by_key[_report_key(r)], -int(r.id)))


def _open_report_counts(db: Session) -> tuple[dict[str, int], dict[int, int]]:
    """Open reports per target and per reported person: several people
    flagging the same thing matters."""
    by_key: dict[str, int] = {}
    by_user: dict[int, int] = {}
    for r in db.query(Report).filter(Report.status == "open"):
        by_key[_report_key(r)] = by_key.get(_report_key(r), 0) + 1
        if r.target_user_id:
            by_user[int(r.target_user_id)] = by_user.get(int(r.target_user_id), 0) + 1
    return by_key, by_user


def _reporter_history(db: Session, rows: list) -> dict[int, dict[str, int]]:
    """A reporter whose reports are mostly dismissed deserves less weight."""
    reporter_ids = {int(r.reporter_id) for r in rows if r.reporter_id}
    if not reporter_ids:
        return {}
    history: dict[int, dict[str, int]] = {}
    counts = (db.query(Report.reporter_id, Report.status, func.count(Report.id))
              .filter(Report.reporter_id.in_(reporter_ids)).group_by(Report.reporter_id, Report.status)
              .all())
    for reporter_id, report_status, count in counts:
        entry = history.setdefault(int(reporter_id), {"total": 0, "dismissed": 0, "resolved": 0})
        entry["total"] += int(count)
        if report_status in ("dismissed", "resolved"):
            entry[report_status] += int(count)
    return history


def _existing_ids(db: Session, column, ids: set) -> set:
    return {i for (i,) in db.query(column).filter(column.in_(ids))} if ids else set()


def _report_snapshot(r) -> dict | None:
    try:
        return json.loads(str(r.target_snapshot)) if r.target_snapshot else None
    except ValueError:
        return None


class _ReportContext:
    """What the report list needs beyond the rows themselves."""

    def __init__(self, db: Session, rows: list):
        user_ids = {int(uid) for r in rows for uid in (r.reporter_id, r.target_user_id) if uid}
        self.users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids))} if user_ids else {}
        self.live_comments = _existing_ids(db, ScrobbleComment.id, {r.comment_id for r in rows if r.comment_id})
        self.live_tracks = _existing_ids(db, Track.id, {r.track_id for r in rows if r.track_id})
        self.open_by_key, self.open_by_user = _open_report_counts(db)
        self.history = _reporter_history(db, rows)

    def person(self, uid) -> dict | None:
        u = self.users.get(uid) if uid else None
        return {"username": u.username, "is_banned": bool(u.is_banned)} if u else None

    def item(self, r) -> dict:
        key = _report_key(r)
        same_open = self.open_by_key.get(key, 0)
        snapshot = _report_snapshot(r)
        return {
            "id": r.id,
            "type": r.target_type,
            "target_key": key,
            "reporter": self.person(r.reporter_id),
            "reporter_history": self.history.get(int(r.reporter_id)) if r.reporter_id else None,
            "target": self.person(r.target_user_id),
            # All open reports about this person (profile and comments)...
            "target_open_reports": self.open_by_user.get(int(r.target_user_id), 0) if r.target_user_id
            else same_open,
            # ...and about this very profile, comment or track
            "same_open_reports": same_open,
            "comment": {"id": r.comment_id, "text": r.comment_text,
                        "exists": r.comment_id in self.live_comments} if r.target_type == "comment" else None,
            "track": {"id": r.track_id, "exists": r.track_id in self.live_tracks, **(snapshot or {})}
            if r.target_type == "track" else None,
            "snapshot": snapshot if r.target_type == "user" else None,
            "reason": r.reason,
            "details": r.details,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "resolved_by": r.resolved_by,
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            "resolution": r.resolution,
        }


@router.get("/reports")
def list_reports(
    db: DB, admin: AdminUser,
    status: Annotated[str, Query(pattern="^(open|resolved|dismissed|all)$")] = "open",
    target_type: Annotated[str | None, Query(pattern="^(user|comment|track)$")] = None,
    sort: Annotated[str, Query(pattern="^(priority|new)$")] = "priority",
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Reports; `priority` puts open targets reported by more people first
    and keeps reports about one target together (the open queue is short;
    closed ones, a growing history, are always newest first and paginated
    in the database). `open_count` feeds the tab badge."""
    query = db.query(Report)
    if status != "all":
        query = query.filter(Report.status == status)
    if target_type:
        query = query.filter(Report.target_type == target_type)
    total = query.count()
    if sort == "priority" and status == "open":
        rows = _rank_by_priority(query.all())[offset:offset + limit]
    else:
        rows = query.order_by(Report.id.desc()).offset(offset).limit(limit).all()
    context = _ReportContext(db, rows)
    return {
        "total": total,
        "open_count": db.query(func.count(Report.id)).filter(Report.status == "open").scalar() or 0,
        "items": [context.item(r) for r in rows],
    }


class ReportResolve(BaseModel):
    status: str = Field(pattern="^(resolved|dismissed)$")
    resolution: str | None = Field(default=None, max_length=300)
    # What to do along with closing: remove the comment, ban its author or
    # the reported profile, or delete the reported track
    action: str = Field(default="none", pattern="^(none|delete_comment|ban_user|delete_track)$")
    # With delete_track: refuse future plays by this artist name
    block_artist: bool = False
    # Older clients: same as action="delete_comment"
    delete_comment: bool = False


def _notify_reporters(db, reports, status: str, report, admin) -> list:
    """Tell everyone who reported it what came of it (never who decided),
    each in their own language."""
    from app.routers.reports import _target_label
    from app.services import notifications
    # Notifications are cut at 120 characters: the outcome goes first
    text = "приняты меры, спасибо!" if status == "resolved" else "нарушений не нашли, спасибо!"
    sent, alerts = set(), []
    for r in reports:
        if not r.reporter_id or r.reporter_id in sent:
            continue
        sent.add(r.reporter_id)
        lang = user_lang(db.query(User).filter(User.id == r.reporter_id).first())
        alerts.append(notifications.create(
            db, recipient_id=int(r.reporter_id), actor_id=int(admin.id), kind=notifications.KIND_SYSTEM,
            message=tr(lang, "Жалоба рассмотрена: {outcome} ({target})",
                       outcome=tr(lang, text), target=_target_label(report, db, lang))))
    return [a for a in alerts if a]


def _action_fits(action: str, report) -> bool:
    if action == "delete_comment":
        return report.target_type == "comment"
    if action == "delete_track":
        return report.target_type == "track"
    if action == "ban_user":
        return bool(report.target_user_id)
    return True


def _delete_reported_comment(db: Session, admin, report, target_name: str) -> dict[str, Any]:
    comment = db.query(ScrobbleComment).filter(ScrobbleComment.id == report.comment_id).first() \
        if report.comment_id else None
    if comment is None:
        return {}
    audit.record(db, admin, "comment.delete", target_name, text=str(comment.content or "")[:200],
                 report_id=report.id)
    db.delete(comment)
    return {"comment_deleted": True}


def _ban_reported_user(db: Session, admin, report, target) -> dict[str, Any]:
    from app.core.security import revoke_all_sessions

    if target is None:
        return {}
    if target.role == "admin":
        raise HTTPException(400, "Нельзя заблокировать администратора")
    if not target.is_banned:
        target.is_banned = True
        revoke_all_sessions(target)
        audit.record(db, admin, "user.ban", str(target.username), report_id=report.id)
    return {"user_banned": True}


def _block_artist(db: Session, admin, report, artist: str) -> dict[str, Any]:
    artist = artist.strip()
    if not artist:
        return {}
    exists = db.query(BlacklistFilter.id).filter(
        BlacklistFilter.filter_type == "artist",
        func.lower(BlacklistFilter.pattern) == artist.lower()).first()
    if not exists:
        db.add(BlacklistFilter(pattern=artist, filter_type="artist",
                               reason=f"Жалоба #{report.id}", is_active=True))
        audit.record(db, admin, "blacklist.create", artist, type="artist", report_id=report.id)
    return {"artist_blocked": True}


def _delete_reported_track(db: Session, admin, report, block_artist: bool) -> dict[str, Any]:
    done: dict[str, Any] = {}
    track = db.query(Track).filter(Track.id == report.track_id).first() if report.track_id else None
    if track is not None:
        artist = str(track.artist or "")
        plays = db.query(Scrobble).filter(Scrobble.track_id == track.id).delete()
        audit.record(db, admin, "catalog.delete_track", f"#{track.id}",
                     track=f"{track.artist} — {track.title}", scrobbles=plays, report_id=report.id)
        db.delete(track)
        done["track_deleted"] = True
    else:
        artist = str(json.loads(str(report.target_snapshot or "{}")).get("artist") or "")
    if block_artist:
        done.update(_block_artist(db, admin, report, artist))
    return done


def _close_reports(db: Session, report, data: ReportResolve, admin) -> dict:
    """The report and every other open one about the same target, by id."""
    closing = {r.id: r for r in _same_target(db.query(Report).filter(Report.status == "open"), report)}
    closing[report.id] = report
    now = datetime.now(UTC)
    for r in closing.values():
        r.status = data.status
        r.resolved_by = str(admin.username)[:64]
        r.resolved_at = now
        r.resolution = data.resolution
    return closing


@router.post("/reports/{report_id}/resolve",
             responses={404: {"description": REPORT_NOT_FOUND},
                        400: {"description": "Action does not fit the report"}})
def resolve_report(report_id: int, data: ReportResolve, background_tasks: BackgroundTasks, db: DB,
                   admin: AdminUser):
    """Close a report and every other open report about the same profile,
    comment or track, optionally acting on it, and tell the reporters."""
    from app.routers.reports import _target_label
    from app.services import notifications

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, REPORT_NOT_FOUND)
    action = "delete_comment" if data.delete_comment and data.action == "none" else data.action
    if not _action_fits(action, report):
        raise HTTPException(400, "Это действие не подходит к жалобе")
    label = _target_label(report, db)
    closing = _close_reports(db, report, data, admin)
    target = db.query(User).filter(User.id == report.target_user_id).first() if report.target_user_id else None
    target_name = str(target.username) if target else label
    done: dict[str, Any] = {}
    if action == "delete_comment":
        done = _delete_reported_comment(db, admin, report, target_name)
    elif action == "ban_user":
        done = _ban_reported_user(db, admin, report, target)
    elif action == "delete_track":
        done = _delete_reported_track(db, admin, report, data.block_artist)
    audit.record(db, admin, "report.resolve", target_name, status=data.status, reports=sorted(closing),
                 resolution=data.resolution, measure=action)
    alerts = _notify_reporters(db, closing.values(), data.status, report, admin)
    db.commit()
    for alert in alerts:
        notifications.schedule_push(background_tasks, alert)
    if done:
        cache.clear_all()
    return {"status": "ok", "closed": len(closing), "comment_deleted": bool(done.get("comment_deleted")),
            **done}
