"""Third-party integrations: Last.fm import, Yandex, Spotify."""

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
    LikeRequest,
    YandexTokenUpdate,
)
from app.services.runtime_settings import require_feature
from app.services.lastfm_import import (
    LASTFM_API_KEY,
    enqueue_import,
    job_to_dict,
    latest_job,
    prepare_import_job,
)

router = APIRouter(tags=["integrations"])


# --- /api/import/lastfm ---
@router.post("/api/import/lastfm",
             dependencies=[Depends(require_feature("lastfm_import"))],
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
@router.post("/api/integrations/yandex")
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
