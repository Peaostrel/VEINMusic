"""Third-party integrations: Last.fm import, Yandex, Spotify."""

from datetime import UTC, datetime
from typing import Annotated

import anyio
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
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
from app.services import runtime_settings
from app.services.lastfm_import import (
    LASTFM_API_KEY,
    enqueue_import,
    job_to_dict,
    latest_job,
    prepare_import_job,
)
from app.services.runtime_settings import require_feature
from app.services.user_preferences import get_preferences

router = APIRouter(tags=["integrations"])


@router.post(
    "/api/integrations/sync",
    responses={409: {"description": "Cloud synchronization is unavailable"}},
)
async def sync_integrations_now(
        data: IntegrationSyncRequest,
        db: Annotated[Session, Depends(get_db)],
        current_user: Annotated[User, Depends(get_current_user)]):
    """Run one immediate cloud poll for the signed-in user."""
    from app.services.cloud_scrobbling import (
        sync_soundcloud_status,
        sync_spotify_status,
        sync_yandex_status,
    )
    from app.services.scrobble_processor import process_scrobble

    preferences = get_preferences(current_user.profile).integrations
    if not preferences.auto_sync:
        raise HTTPException(409, "Автоматическая синхронизация приостановлена")
    jobs = {
        "spotify": (bool(current_user.integration.spotify_access_token), preferences.spotify_enabled, sync_spotify_status),
        "yandex": (bool(current_user.integration.yandex_token), preferences.yandex_enabled, sync_yandex_status),
        "soundcloud": (bool(current_user.integration.soundcloud_access_token), preferences.soundcloud_enabled, sync_soundcloud_status),
    }
    selected = jobs.items() if data.service == "all" else [(data.service, jobs[data.service])]
    completed = []
    async with redis_lock(f"manual-sync:{current_user.id}", expire_sec=20):
        for name, (linked, enabled, sync_func) in selected:
            if linked and enabled and runtime_settings.is_feature_enabled(
                f"integration_{name}", db
            ):
                await sync_func(current_user, db, process_scrobble)
                completed.append(name)
        if not completed:
            raise HTTPException(409, "Нет активных облачных интеграций для синхронизации")
        current_user.integration.last_sync = datetime.now(UTC)
        db.commit()
    return {"status": "ok", "services": completed, "last_sync": current_user.integration.last_sync}


# --- /api/import/lastfm ---
@router.post("/api/import/lastfm",
             dependencies=[Depends(require_feature("lastfm_import")),
                           Depends(require_feature("integration_lastfm"))],
             responses={400: {"description": "Last.fm username not set"},
                        503: {"description": "API key not configured or import switched off"}})
async def start_lastfm_import(data: LikeRequest,
                              db: Annotated[Session,
                                            Depends(get_db)],
                              current_user: Annotated[User,
                                                      Depends(get_current_user)]):
    """Start (or resume) importing Last.fm history.

    The first import takes the whole history; later ones import only what was
    scrobbled since the previous import. Progress: GET /api/import/lastfm/status."""
    user = current_user
    if not get_preferences(user.profile).integrations.lastfm_enabled:
        raise HTTPException(409, "Last.fm приостановлен в настройках аккаунта")
    if not user.integration.lastfm_username:
        raise HTTPException(400, "Last.fm username not set in profile")
    if not LASTFM_API_KEY:
        raise HTTPException(503, "Last.fm API key not configured on server")

    async with redis_lock(f"lastfm_import:{user.id}", expire_sec=10):
        job, needs_enqueue = await anyio.to_thread.run_sync(prepare_import_job, db, user)
        job_info = job_to_dict(job)
    if needs_enqueue:
        await enqueue_import(int(job_info["id"]))
    return {"status": "import_started" if needs_enqueue else "already_running", "job": job_info}


@router.get("/api/import/lastfm/status")
def get_lastfm_import_status(db: Annotated[Session, Depends(get_db)],
                             current_user: Annotated[User, Depends(get_current_user)]):
    return job_to_dict(latest_job(db, int(current_user.id)))


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
    db.commit()
    return {"status": "ok"}
