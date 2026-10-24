"""Third-party integrations: Last.fm import, Yandex, Spotify."""

import logging
from typing import Annotated

import anyio
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.redis import redis_lock
from app.core.security import get_current_user
from app.database import get_db
from app.models import (
    User,
)
from app.schemas import (
    IntegrationSyncRequest,
    LikeRequest,
    YandexTokenUpdate,
)
from app.services.lastfm_import import (
    LASTFM_API_KEY,
    NOT_VERIFIED,
    STOPPED,
    ImportAlreadyDone,
    enqueue_import,
    import_locked,
    is_stale,
    job_to_dict,
    latest_job,
    prepare_import_job,
)
from app.services.runtime_settings import require_feature
from app.services.user_preferences import get_preferences

logger = logging.getLogger(__name__)
router = APIRouter(tags=["integrations"])
# Longer than this, the answer says the sync continues in the background.
MANUAL_SYNC_WAIT_SEC = 20


def _sync_targets(db: Session, user: User, service: str) -> list[str]:
    from app.services.cloud_scrobbling import CLOUD_SERVICES, linked_services
    if not get_preferences(user.profile).integrations.auto_sync:
        raise HTTPException(409, "Автоматическая синхронизация приостановлена")
    services = linked_services(user, db, CLOUD_SERVICES if service == "all" else (service,))
    if not services:
        raise HTTPException(409, "Нет активных облачных интеграций для синхронизации")
    return services


def _last_sync(db: Session, user: User):
    db.refresh(user.integration)
    return user.integration.last_sync


@router.post(
    "/api/integrations/sync",
    responses={
        202: {"description": "Synchronization is still running in the background"},
        409: {"description": "Cloud synchronization is unavailable"},
        502: {"description": "A music service failed during synchronization"},
    },
)
async def sync_integrations_now(
        data: IntegrationSyncRequest,
        db: Annotated[Session, Depends(get_db)],
        current_user: Annotated[User, Depends(get_current_user)]):
    """Run one immediate cloud poll for the signed-in user.

    Provider calls and their database writes run in the arq worker, so a slow
    Spotify or Yandex response never stalls this process's event loop."""
    from app.core.redis import get_arq_pool
    from app.services.cloud_scrobbling import sync_user_now
    from app.services.scrobble_processor import process_scrobble

    services = await anyio.to_thread.run_sync(_sync_targets, db, current_user, data.service)
    user_id = int(current_user.id)
    pool = await get_arq_pool()
    if pool is None:
        # No Redis (local development): nothing else shares this loop.
        completed = await sync_user_now(user_id, services, process_scrobble)
    else:
        job = await pool.enqueue_job("sync_cloud_user", user_id, services, _job_id=f"manual_sync:{user_id}")
        if job is None:
            raise HTTPException(409, "Синхронизация уже идёт, подождите немного")
        try:
            completed = await job.result(timeout=MANUAL_SYNC_WAIT_SEC)
        except TimeoutError:
            return JSONResponse({"status": "queued", "services": services}, status_code=202)
        except Exception:
            logger.warning("Manual cloud sync failed for user %s", user_id, exc_info=True)
            raise HTTPException(502, "Сервис музыки не ответил, попробуйте позже") from None
    if not completed:
        raise HTTPException(409, "Нет активных облачных интеграций для синхронизации")
    last_sync = await anyio.to_thread.run_sync(_last_sync, db, current_user)
    return {"status": "ok", "services": completed, "last_sync": last_sync}


# --- /api/import/lastfm ---
@router.post("/api/import/lastfm",
             dependencies=[Depends(require_feature("lastfm_import")),
                           Depends(require_feature("integration_lastfm"))],
             responses={409: {"description": "Last.fm is paused in account settings, "
                                             "or the history has already been imported"},
                        400: {"description": "Last.fm username not set"},
                        403: {"description": "The Last.fm account is not confirmed by signing in"},
                        503: {"description": "API key not configured or import switched off"}})
async def start_lastfm_import(data: LikeRequest,
                              db: Annotated[Session,
                                            Depends(get_db)],
                              current_user: Annotated[User,
                                                      Depends(get_current_user)]):
    """Start (or resume) importing Last.fm history.

    The history is imported once: after an import that added plays, a new one
    is refused with 409 (an interrupted import can still be resumed).
    Progress: GET /api/import/lastfm/status."""
    user = current_user
    if not get_preferences(user.profile).integrations.lastfm_enabled:
        raise HTTPException(409, "Last.fm приостановлен в настройках аккаунта")
    if not user.integration.lastfm_username:
        raise HTTPException(400, "Last.fm username not set in profile")
    if not user.integration.lastfm_verified:
        raise HTTPException(403, NOT_VERIFIED)
    if not LASTFM_API_KEY:
        raise HTTPException(503, "Last.fm API key not configured on server")

    async with redis_lock(f"lastfm_import:{user.id}", expire_sec=10):
        try:
            job, needs_enqueue = await anyio.to_thread.run_sync(prepare_import_job, db, user)
        except ImportAlreadyDone as done:
            raise HTTPException(409, done.message) from None
        job_info = job_to_dict(job)
    if needs_enqueue:
        await enqueue_import(int(job_info["id"]))
    return {"status": "import_started" if needs_enqueue else "already_running", "job": job_info}


@router.get("/api/import/lastfm/status")
def get_lastfm_import_status(db: Annotated[Session, Depends(get_db)],
                             current_user: Annotated[User, Depends(get_current_user)]):
    job = latest_job(db, int(current_user.id))
    # A running or interrupted import can still be continued
    unfinished = job is not None and job.status in ("pending", "in_progress", "failed")
    status = {**job_to_dict(job), "locked": not unfinished and import_locked(db, current_user)}
    if job is not None and job.status in ("pending", "in_progress") and is_stale(job):
        # No progress for a while: the worker lost it; "Import" resumes it
        status.update(status="failed", error=STOPPED)
    return status


# --- /api/integrations/yandex ---
@router.post("/api/integrations/yandex",
             dependencies=[Depends(require_feature("integration_yandex"))])
def update_yandex_token(data: YandexTokenUpdate, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user

    user.integration.yandex_token = data.token.strip() or None
    db.commit()
    return {"status": "ok"}


# --- /api/integrations/spotify/disconnect ---
@router.post("/api/integrations/spotify/disconnect")
def disconnect_spotify(data: LikeRequest, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user

    user.integration.spotify_access_token = None
    user.integration.spotify_refresh_token = None
    db.commit()
    return {"status": "ok"}


# --- /api/integrations/soundcloud/disconnect ---
@router.post("/api/integrations/soundcloud/disconnect")
def disconnect_soundcloud(data: LikeRequest, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    integration = current_user.integration
    integration.soundcloud_access_token = None
    integration.soundcloud_refresh_token = None
    integration.soundcloud_token_expires_at = None
    integration.soundcloud_recent_tracks = None
    integration.soundcloud_current_track = None
    integration.soundcloud_track_started_at = None
    db.commit()
    return {"status": "ok"}


# --- /api/integrations/yandex/disconnect ---
@router.post("/api/integrations/yandex/disconnect")
def disconnect_yandex(data: LikeRequest, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user

    user.integration.yandex_token = None
    db.commit()
    return {"status": "ok"}


# --- /api/integrations/lastfm/disconnect ---
@router.post("/api/integrations/lastfm/disconnect")
def disconnect_lastfm(data: LikeRequest, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user

    user.integration.lastfm_username = None
    user.integration.lastfm_verified = False
    db.commit()
    return {"status": "ok"}
