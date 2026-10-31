"""One-time, resumable import of Last.fm listening history.

A user imports their Last.fm history once: after an import that added plays,
another one is refused (undoing that import in the history tools allows it
again). Each job covers a fixed time window up to the moment it started,
which makes Last.fm's pagination stable, so a job can stop (worker restart,
API error) and resume from ``current_page``.

Imported plays keep their original Last.fm time, count as one full play
(1 XP each, 2 for a favourite, like a live play) and are matched against plays VEIN already
recorded, so a history that VEIN itself exported to Last.fm, or that
another scrobbler sent there, is not counted twice. When the job finishes,
achievements are checked for the whole history.

Jobs run in the arq worker (``import_lastfm`` job) or, without Redis, as an
in-process task. Blocking DB work runs in a thread.
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Optional

import anyio
import httpx

from app.core.constants import TEXT_KEY
from app.core.i18n import plural, tr, user_lang
from app.core.websockets import manager
from app.database import SessionLocal
from app.models import LastfmImportJob, Scrobble, Track, User
from app.services.cache import invalidate_user
from app.services.metadata_cleaner import clean_track_metadata

logger = logging.getLogger(__name__)

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/"
PAGE_SIZE = 200
PAGE_DELAY_SEC = 0.3          # stay well below Last.fm's rate limit
MAX_PAGE_RETRIES = 3
STALE_AFTER = timedelta(minutes=10)
ACTIVE_STATUSES = ("pending", "in_progress")
# A play VEIN recorded and the same play on Last.fm: the same moment (VEIN
# exports whole seconds), or the same track a little apart (another
# scrobbler may stamp the play a bit earlier or later)
SAME_MOMENT_SEC = 2
SAME_TRACK_WINDOW_SEC = 300
# Last.fm's grey star shown for tracks without artwork
LASTFM_PLACEHOLDER_COVER = "2a96cbd8b46e442fc41c2b86b821562f"
STOPPED = "импорт был остановлен на сервере"
ALREADY_IMPORTED = "Импорт из Last.fm уже выполнен. Повторно его запустить нельзя."
TAKEN_ACCOUNT = "История этого аккаунта Last.fm уже перенесена в другой профиль VEIN."
NOT_VERIFIED = "Подтвердите аккаунт Last.fm: войдите через Last.fm в настройках, вкладка «Интеграции»."


class LastfmApiError(Exception):
    """Last.fm answered with an error for this page."""


class ImportAlreadyDone(Exception):
    """The user, or another VEIN account, already imported this history."""

    def __init__(self, message: str = ALREADY_IMPORTED):
        super().__init__(message)
        self.message = message


def _as_aware(dt: Any) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def job_to_dict(job: Optional[LastfmImportJob]) -> dict[str, Any]:
    if job is None:
        return {"status": "none"}
    total_pages = int(job.total_pages or 0)
    current_page = int(job.current_page or 0)
    progress = 100 if job.status == "completed" else 0
    if total_pages:
        progress = int(current_page * 100 / total_pages)
    return {
        "id": job.id,
        "status": job.status,
        "lastfm_username": job.lastfm_username,
        "current_page": current_page,
        "total_pages": total_pages,
        "progress": progress,
        "imported_tracks": job.imported_tracks or 0,
        "total_tracks": job.total_tracks or 0,
        "error": job.error_log,
        "started_at": _iso(job.started_at),
        "finished_at": _iso(job.finished_at),
        "incremental": job.window_from is not None,
    }


def _iso(dt: Any) -> Optional[str]:
    aware = _as_aware(dt)
    return aware.isoformat() if aware else None


def latest_job(db, user_id: int) -> Optional[LastfmImportJob]:
    return db.query(LastfmImportJob).filter(
        LastfmImportJob.user_id == user_id).order_by(LastfmImportJob.id.desc()).first()


def is_stale(job: LastfmImportJob) -> bool:
    last = _as_aware(job.updated_at) or _as_aware(job.started_at)  # type: ignore[arg-type]
    return last is None or datetime.now(UTC) - last > STALE_AFTER


def _done_imports(db, user_id: int):
    return db.query(LastfmImportJob).filter(
        LastfmImportJob.user_id == user_id,
        LastfmImportJob.status == "completed",
        LastfmImportJob.imported_tracks > 0,
    )


def import_locked(db, user: User) -> bool:
    """True once the user's Last.fm history has been imported."""
    if db.query(_done_imports(db, int(user.id)).exists()).scalar():
        return True
    # The flag alone also comes from older imports that added nothing:
    # it counts only while imported Last.fm plays exist
    if user.integration is None or not user.integration.has_imported_lastfm:
        return False
    return db.query(db.query(Scrobble.id).execution_options(include_excluded=True, include_deleted=True).filter(
        Scrobble.user_id == user.id, Scrobble.is_imported.is_(True), Scrobble.source == "lastfm").exists()).scalar()


def _imported_elsewhere(db, user: User) -> bool:
    """The same Last.fm history already went to another VEIN account."""
    from sqlalchemy import func
    name = (user.integration.lastfm_username or "").strip().lower()
    if not name:
        return False
    done = db.query(LastfmImportJob.id).filter(
        LastfmImportJob.user_id != user.id,
        func.lower(LastfmImportJob.lastfm_username) == name,
        LastfmImportJob.status == "completed",
        LastfmImportJob.imported_tracks > 0,
    )
    return bool(db.query(done.exists()).scalar())


def refresh_import_flag(db, user: User) -> None:
    """Recompute has_imported_lastfm after an import was undone (no commit)."""
    if user.integration is not None:
        db.flush()
        user.integration.has_imported_lastfm = bool(
            db.query(_done_imports(db, int(user.id)).exists()).scalar())


def prepare_import_job(db, user: User) -> tuple[LastfmImportJob, bool]:
    """Return (job, needs_enqueue): the running job, a resumed one or a new one.

    Raises ImportAlreadyDone when the history has already been imported."""
    job = latest_job(db, int(user.id))
    if job is not None and job.status in ACTIVE_STATUSES and not is_stale(job):
        return job, False  # already running
    if job is not None and (job.status == "failed" or (job.status in ACTIVE_STATUSES and is_stale(job))):
        job.status = "pending"  # type: ignore[assignment]
        job.error_log = None  # type: ignore[assignment]
        job.updated_at = datetime.now(UTC)  # type: ignore[assignment]
        db.commit()
        return job, True  # resume where it stopped
    if import_locked(db, user):
        raise ImportAlreadyDone()
    if _imported_elsewhere(db, user):
        raise ImportAlreadyDone(TAKEN_ACCOUNT)

    job = LastfmImportJob(
        user_id=user.id,
        lastfm_username=user.integration.lastfm_username,
        status="pending",
        window_from=None,
        window_to=int(datetime.now(UTC).timestamp()),
        current_page=0,
        total_pages=0,
        imported_tracks=0,
        updated_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job, True


async def enqueue_import(job_id: int) -> None:
    from app.core.redis import enqueue_background_task
    # One execution per import: retrying a job that only looked stale must
    # not start a second worker on the same pages (duplicate plays and XP)
    await enqueue_background_task("import_lastfm", job_id, unique_id=f"lastfm-import:{job_id}")


@dataclass
class _Play:
    """One Last.fm scrobble of a page."""
    ts: int
    title: str
    artist: str
    album: Optional[str]
    cover: Optional[str]


@dataclass
class _Known:
    """A play the user already has around the page's time range."""
    ts: int
    track_id: int
    key: tuple[str, str]
    exact_only: bool  # an imported play: matches only the same moment
    used: bool = False


def _parse_play(t: dict) -> Optional[_Play]:
    if (t.get("@attr") or {}).get("nowplaying") == "true":
        return None
    title = (t.get("name") or "").strip()
    artist = ((t.get("artist") or {}).get(TEXT_KEY) or "").strip()
    try:
        ts = int((t.get("date") or {}).get("uts", 0) or 0)
    except (TypeError, ValueError):
        ts = 0
    if not title or not artist or ts <= 0:
        return None
    album = ((t.get("album") or {}).get(TEXT_KEY) or "").strip() or None
    images = [image for image in (t.get("image") or []) if isinstance(image, dict)]
    cover = (images[-1].get(TEXT_KEY) or None) if images else None
    if cover and LASTFM_PLACEHOLDER_COVER in cover:
        cover = None
    return _Play(ts=ts, title=title, artist=artist, album=album, cover=cover)


def _track_key(title: str, artist: str) -> tuple[str, str]:
    norm_title, norm_artist = clean_track_metadata(title, artist)
    return norm_title.casefold(), norm_artist.casefold()


def _known_plays(db, user_id: int, first: int, last: int) -> list[_Known]:
    """Plays that stand for a Last.fm scrobble around the page's time range.

    A live play that never reached the 85% rule is left out, so the full
    play Last.fm counted is still imported; a play the user excluded or
    deleted is kept, so the import does not bring it back."""
    from sqlalchemy import func, or_
    start = datetime.fromtimestamp(first - SAME_TRACK_WINDOW_SEC, tz=UTC)
    end = datetime.fromtimestamp(last + SAME_TRACK_WINDOW_SEC, tz=UTC)
    counted = Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85
    rows = db.query(Scrobble.played_at, Scrobble.track_id, Scrobble.is_imported, Track.title, Track.artist) \
        .execution_options(include_excluded=True, include_deleted=True) \
        .join(Track, Track.id == Scrobble.track_id) \
        .filter(Scrobble.user_id == user_id, Scrobble.played_at >= start, Scrobble.played_at <= end,
                or_(counted, Scrobble.is_imported.is_(True), Scrobble.excluded_from_stats.is_(True),
                    Scrobble.deleted_at.isnot(None))).all()
    return [_Known(ts=int(_as_aware(played_at).timestamp()), track_id=int(track_id),  # type: ignore[union-attr]
                   key=(str(title).casefold(), str(artist).casefold()), exact_only=bool(is_imported))
            for played_at, track_id, is_imported, title, artist in rows]


def _take(known: list[_Known], ts: int, window: int, match=None) -> bool:
    """Mark the nearest unused known play within ``window`` seconds as matched."""
    candidates = [k for k in known if not k.used and abs(k.ts - ts) <= window and (match is None or match(k))]
    if not candidates:
        return False
    min(candidates, key=lambda k: abs(k.ts - ts)).used = True
    return True


def _new_plays(db, user_id: int, plays: list[_Play]) -> list[tuple[_Play, Optional[Track]]]:
    """Plays of the page the user does not have yet, with their catalog track."""
    from app.services.scrobble_processor import lookup_track
    if not plays:
        return []
    known = _known_plays(db, user_id, min(p.ts for p in plays), max(p.ts for p in plays))
    # First the plays recorded at the same moment, then the same track nearby:
    # a repeat of a track a few minutes later must keep its own match
    left = [p for p in plays if not _take(known, p.ts, SAME_MOMENT_SEC)]
    result = []
    for play in left:
        track, _ = lookup_track(db, play.title, play.artist, user_id)
        key = _track_key(play.title, play.artist)
        track_id = int(track.id) if track is not None else None

        def same_track(k: _Known, key=key, track_id=track_id) -> bool:
            return not k.exact_only and (k.track_id == track_id or k.key == key)

        if not _take(known, play.ts, SAME_TRACK_WINDOW_SEC, same_track):
            result.append((play, track))
    return result


def _import_play(db, job: LastfmImportJob, owner: Optional[User], play: _Play, track: Optional[Track]) -> None:
    from app.services.scrobble_processor import (
        _check_favorite,
        _find_or_create_track,
        full_listen_sec,
        known_album_spelling,
    )
    if track is None:
        track, _ = _find_or_create_track(db, play.title, play.artist, play.cover or "", "", 0,
                                         play.album or "", int(job.user_id))
    else:
        if play.cover and not track.cover_url:
            from app.core.cover_urls import proxied_image_url
            track.cover_url = proxied_image_url(play.cover) or None  # type: ignore[assignment]
        if play.album and not track.album:
            track.album = known_album_spelling(db, str(track.artist or ""), play.album)  # type: ignore[assignment]
    played_at = datetime.fromtimestamp(play.ts, tz=UTC)
    # As for a live play: 2 XP for a favourite artist, track or album. The
    # event multiplier is left out: it rewards listening during the event
    xp = 2 if owner is not None and _check_favorite(track, owner) else 1
    db.add(Scrobble(user_id=job.user_id, track_id=track.id, source="lastfm",
                    played_at=played_at, listened_sec=full_listen_sec(track), is_playing=False,
                    updated_at=played_at, xp_earned=xp, is_imported=True, import_job_id=job.id))


def _store_page(job_id: int, tracks: list[dict], page: int, total_pages: int, total_tracks: int) -> int:
    """Insert one page of Last.fm scrobbles and record progress (blocking)."""
    db = SessionLocal()
    try:
        job = db.query(LastfmImportJob).filter(LastfmImportJob.id == job_id).first()
        if job is None or job.status not in ACTIVE_STATUSES:
            return 0
        plays = [play for play in map(_parse_play, tracks) if play is not None]
        new = _new_plays(db, int(job.user_id), plays)
        owner = db.query(User).filter(User.id == job.user_id).first()
        for play, track in new:
            _import_play(db, job, owner, play, track)
        job.current_page = page  # type: ignore[assignment]
        job.total_pages = total_pages  # type: ignore[assignment]
        job.total_tracks = total_tracks  # type: ignore[assignment]
        job.imported_tracks = int(job.imported_tracks or 0) + len(new)  # type: ignore[assignment]
        job.updated_at = datetime.now(UTC)  # type: ignore[assignment]
        db.commit()
        return len(new)
    finally:
        db.close()


def _set_job_state(job_id: int, **fields: Any) -> Optional[dict[str, Any]]:
    db = SessionLocal()
    try:
        job = db.query(LastfmImportJob).filter(LastfmImportJob.id == job_id).first()
        if job is None:
            return None
        for name, value in fields.items():
            setattr(job, name, value)
        job.updated_at = datetime.now(UTC)  # type: ignore[assignment]
        if fields.get("status") == "completed" and int(job.imported_tracks or 0) > 0:
            owner = db.query(User).filter(User.id == job.user_id).first()
            if owner is not None and owner.integration is not None:
                owner.integration.has_imported_lastfm = True
        db.commit()
        owner = db.query(User).filter(User.id == job.user_id).first()
        username = owner.username if owner else None
        return {**job_to_dict(job), "user_id": job.user_id, "username": username, "lang": user_lang(owner),
                "window_from": job.window_from, "window_to": job.window_to}
    finally:
        db.close()


async def _fetch_page(client: httpx.AsyncClient, info: dict[str, Any], page: int) -> dict[str, Any]:
    params: dict[str, Any] = {
        "method": "user.getrecenttracks",
        "user": info["lastfm_username"],
        "api_key": LASTFM_API_KEY,
        "format": "json",
        "limit": PAGE_SIZE,
        "page": page,
        "to": info["window_to"],
    }
    if info.get("window_from"):
        params["from"] = int(info["window_from"]) + 1
    last_error = "unknown error"
    for attempt in range(MAX_PAGE_RETRIES):
        try:
            resp = await client.get(LASTFM_BASE_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                if "error" not in data:
                    return data.get("recenttracks") or {}
                last_error = f"Last.fm error {data.get('error')}: {data.get('message')}"
                if data.get("error") in (6, 10, 17):  # bad user / key / private profile
                    break
            else:
                last_error = f"HTTP {resp.status_code}"
        except httpx.HTTPError as e:
            last_error = str(e)
        await asyncio.sleep(2 ** attempt)
    raise LastfmApiError(last_error)


async def run_import_job(job_id: int) -> None:
    """Import the job's pages starting after ``current_page``."""
    info = await anyio.to_thread.run_sync(lambda: _set_job_state(job_id, status="in_progress"))
    if info is None:
        return
    if not LASTFM_API_KEY:
        await anyio.to_thread.run_sync(lambda: _set_job_state(
            job_id, status="failed", error_log="LASTFM_API_KEY is not configured on the server"))
        return

    page = int(info["current_page"]) + 1
    total_pages = max(int(info["total_pages"] or 0), 1)
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            while page <= total_pages:
                recent = await _fetch_page(client, info, page)
                attrs = recent.get("@attr") or {}
                total_pages = int(attrs.get("totalPages") or 0)
                total_tracks = int(attrs.get("total") or 0)
                tracks = recent.get("track") or []
                if isinstance(tracks, dict):  # a single track is not wrapped in a list
                    tracks = [tracks]
                current = page
                await anyio.to_thread.run_sync(
                    _store_page, job_id, tracks, current, total_pages, total_tracks)
                logger.info(f"Last.fm import job {job_id}: page {page}/{total_pages}")
                page += 1
                await asyncio.sleep(PAGE_DELAY_SEC)
    except asyncio.CancelledError:
        # Worker shutdown or job timeout: leave the job resumable, not "running"
        _set_job_state(job_id, status="failed", error_log=STOPPED)
        raise
    except Exception as e:
        logger.warning(f"Last.fm import job {job_id} failed: {e}")
        error_text = str(e)[:500]
        final = await anyio.to_thread.run_sync(
            lambda: _set_job_state(job_id, status="failed", error_log=error_text))
        if final:
            invalidate_user(str(final["username"]))
            await manager.broadcast_to_user(final["username"], {
                "type": "IMPORT_FINISHED",
                "message": tr(final["lang"],
                              "❌ Импорт из Last.fm прервался. Нажмите «Импорт» ещё раз, чтобы продолжить.")})
        return

    final = await anyio.to_thread.run_sync(
        lambda: _set_job_state(job_id, status="completed", finished_at=datetime.now(UTC)))
    if final:
        invalidate_user(str(final["username"]))
        await manager.broadcast_to_user(final["username"], {
            "type": "IMPORT_FINISHED",
            "message": import_finished_text(final["lang"], int(final["imported_tracks"] or 0))})
        await _award_achievements(int(final["user_id"]))


async def _award_achievements(user_id: int) -> None:
    """Unlock what the imported history now qualifies for."""
    from app.services.achievements import award_achievements_for_user, notify_achievements_unlocked
    try:
        awarded = await anyio.to_thread.run_sync(award_achievements_for_user, user_id)
        await notify_achievements_unlocked(user_id, awarded)
    except Exception:
        logger.exception("Achievement check after Last.fm import failed for user %s", user_id)


def import_finished_text(lang: str, imported: int) -> str:
    return tr(lang, "✅ Импорт завершен! Добавлено {n} треков.", n=imported,
              tracks=plural(lang, imported, "трек", "трека", "треков"))
