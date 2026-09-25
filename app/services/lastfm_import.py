"""Incremental, resumable import of Last.fm listening history.

Each import job covers a fixed time window (window_from, window_to]: the first
import takes the whole history, later ones only what was played since the
previous completed import. The window makes Last.fm's pagination stable, so a
job can stop (worker restart, API error) and resume from ``current_page``.

Jobs run in the arq worker (``import_lastfm`` job) or, without Redis, as an
in-process task. Blocking DB work runs in a thread.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any, Optional

import anyio
import httpx

from app.core.constants import TEXT_KEY
from app.core.websockets import manager
from app.database import SessionLocal
from app.models import LastfmImportJob, Scrobble, Track, User

logger = logging.getLogger(__name__)

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/"
PAGE_SIZE = 200
PAGE_DELAY_SEC = 0.3          # stay well below Last.fm's rate limit
MAX_PAGE_RETRIES = 3
STALE_AFTER = timedelta(minutes=10)
ACTIVE_STATUSES = ("pending", "in_progress")


class LastfmApiError(Exception):
    """Last.fm answered with an error for this page."""


def _as_aware(dt: Any) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def job_to_dict(job: Optional[LastfmImportJob]) -> dict[str, Any]:
    if job is None:
        return {"status": "none"}
    total_pages = int(job.total_pages or 0)
    current_page = int(job.current_page or 0)
    return {
        "id": job.id,
        "status": job.status,
        "lastfm_username": job.lastfm_username,
        "current_page": current_page,
        "total_pages": total_pages,
        "progress": int(current_page * 100 / total_pages) if total_pages else (100 if job.status == "completed" else 0),
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


def _is_stale(job: LastfmImportJob) -> bool:
    last = _as_aware(job.updated_at) or _as_aware(job.started_at)  # type: ignore[arg-type]
    return last is None or datetime.now(UTC) - last > STALE_AFTER


def prepare_import_job(db, user: User) -> tuple[LastfmImportJob, bool]:
    """Return (job, needs_enqueue): the running job, a resumed one or a new one."""
    job = latest_job(db, int(user.id))
    if job is not None and job.status in ACTIVE_STATUSES and not _is_stale(job):
        return job, False  # already running
    if job is not None and (job.status == "failed" or (job.status in ACTIVE_STATUSES and _is_stale(job))):
        job.status = "pending"  # type: ignore[assignment]
        job.error_log = None  # type: ignore[assignment]
        job.updated_at = datetime.now(UTC)  # type: ignore[assignment]
        db.commit()
        return job, True  # resume where it stopped

    last_completed = db.query(LastfmImportJob).filter(
        LastfmImportJob.user_id == user.id,
        LastfmImportJob.status == "completed",
        LastfmImportJob.window_to.isnot(None),
    ).order_by(LastfmImportJob.id.desc()).first()
    job = LastfmImportJob(
        user_id=user.id,
        lastfm_username=user.integration.lastfm_username,
        status="pending",
        window_from=last_completed.window_to if last_completed else None,
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
    await enqueue_background_task("import_lastfm", job_id)


def _get_or_create_import_track(db, title: str, artist: str, cover: Optional[str], album: Optional[str]) -> Track:
    track = db.query(Track).filter(Track.title == title, Track.artist == artist).first()
    if not track:
        track = Track(title=title, artist=artist, cover_url=cover, album=album, duration=180)
        db.add(track)
        db.flush()
    return track


def _store_page(job_id: int, tracks: list[dict], page: int, total_pages: int, total_tracks: int) -> int:
    """Insert one page of Last.fm scrobbles and record progress (blocking)."""
    db = SessionLocal()
    try:
        job = db.query(LastfmImportJob).filter(LastfmImportJob.id == job_id).first()
        if job is None:
            return 0
        imported = 0
        for t in tracks:
            if (t.get("@attr") or {}).get("nowplaying") == "true":
                continue
            title = t.get("name")
            artist = (t.get("artist") or {}).get(TEXT_KEY)
            uts = int((t.get("date") or {}).get("uts", 0) or 0)
            if not title or not artist or not uts:
                continue
            played_at = datetime.fromtimestamp(uts, tz=UTC)
            if db.query(Scrobble.id).filter(Scrobble.user_id == job.user_id,
                                            Scrobble.played_at == played_at).first():
                continue
            album = (t.get("album") or {}).get(TEXT_KEY) or None
            images = t.get("image") or []
            cover = (images[-1] or {}).get(TEXT_KEY) or None if images else None
            track = _get_or_create_import_track(db, title, artist, cover, album)
            duration = track.duration or 180
            db.add(Scrobble(user_id=job.user_id, track_id=track.id, source="lastfm",
                            played_at=played_at, listened_sec=duration, is_playing=False,
                            updated_at=played_at, xp_earned=1, is_imported=True))
            imported += 1
        job.current_page = page  # type: ignore[assignment]
        job.total_pages = total_pages  # type: ignore[assignment]
        job.total_tracks = total_tracks  # type: ignore[assignment]
        job.imported_tracks = int(job.imported_tracks or 0) + imported  # type: ignore[assignment]
        job.updated_at = datetime.now(UTC)  # type: ignore[assignment]
        db.commit()
        return imported
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
        if fields.get("status") == "completed":
            owner = db.query(User).filter(User.id == job.user_id).first()
            if owner is not None and owner.integration is not None:
                owner.integration.has_imported_lastfm = True
        db.commit()
        username = db.query(User.username).filter(User.id == job.user_id).scalar()
        return {**job_to_dict(job), "user_id": job.user_id, "username": username,
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
                    lambda: _store_page(job_id, tracks, current, total_pages, total_tracks))
                logger.info(f"Last.fm import job {job_id}: page {page}/{total_pages}")
                page += 1
                await asyncio.sleep(PAGE_DELAY_SEC)
    except Exception as e:
        logger.warning(f"Last.fm import job {job_id} failed: {e}")
        error_text = str(e)[:500]
        final = await anyio.to_thread.run_sync(
            lambda: _set_job_state(job_id, status="failed", error_log=error_text))
        if final:
            await manager.broadcast_to_user(final["username"], {
                "type": "IMPORT_FINISHED",
                "message": "❌ Импорт из Last.fm прервался. Нажмите «Импорт» ещё раз, чтобы продолжить."})
        return

    final = await anyio.to_thread.run_sync(
        lambda: _set_job_state(job_id, status="completed", finished_at=datetime.now(UTC)))
    if final:
        await manager.broadcast_to_user(final["username"], {
            "type": "IMPORT_FINISHED",
            "message": f"✅ Импорт завершен! Добавлено {final['imported_tracks']} треков."})
