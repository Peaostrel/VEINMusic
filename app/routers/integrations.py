"""Third-party integrations: Last.fm import, Yandex, Spotify."""

from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
)
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import SessionLocal, get_db
from app.models import (
    User,
)
from app.schemas import (
    LikeRequest,
    YandexTokenUpdate,
)
from app.services.lastfm_import import (
    IMPORTING_USERS,
    LASTFM_API_KEY,
    import_lastfm_history,
)

router = APIRouter(tags=["integrations"])

# --- /api/import/lastfm ---


@router.post("/api/import/lastfm",
             responses={429: {"description": "Import already running"},
                        400: {"description": "Last.fm username not set"},
                        500: {"description": "API key not configured"}})
async def start_lastfm_import(data: LikeRequest,
                              background_tasks: BackgroundTasks,
                              db: Annotated[Session,
                                            Depends(get_db)],
                              current_user: Annotated[User,
                                                      Depends(get_current_user)]):
    user = current_user

    if str(user.id) in IMPORTING_USERS:
        raise HTTPException(429, "Импорт уже запущен")
    if not user.integration.lastfm_username:
        raise HTTPException(400, "Last.fm username not set in profile")
    if user.integration.has_imported_lastfm:
        raise HTTPException(400, "Импорт из Last.fm можно сделать только один раз")
    if not LASTFM_API_KEY:
        raise HTTPException(500, "Last.fm API key not configured on server")

    IMPORTING_USERS.add(str(user.id))
    # has_imported_lastfm is set by the background job only once the import
    # actually succeeded, so a failed import can be retried.
    background_tasks.add_task(import_lastfm_history, int(user.id), SessionLocal)
    return {"status": "import_started"}


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
