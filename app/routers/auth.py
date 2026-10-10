import base64
import hashlib
import hmac
import os
import secrets
import urllib.parse
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core import login_guard
from app.core.rate_limit import limiter
from app.core.security import (
    SECRET_KEY,
    create_session_token,
    get_current_user,
    get_password_hash,
    revoke_all_sessions,
    verify_password,
)
from app.database import get_db
from app.models import User, UserIntegration, UserProfile
from app.schemas import UserCreate, UserLogin
from app.services import runtime_settings

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LENGTH = 8
INVALID_STATE_PARAMETER = "Invalid state parameter"

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv(
    "SPOTIFY_REDIRECT_URI",
    "http://127.0.0.1:8000/auth/spotify/callback")
SOUNDCLOUD_CLIENT_ID = os.getenv("SOUNDCLOUD_CLIENT_ID")
SOUNDCLOUD_CLIENT_SECRET = os.getenv("SOUNDCLOUD_CLIENT_SECRET")
SOUNDCLOUD_REDIRECT_URI = os.getenv(
    "SOUNDCLOUD_REDIRECT_URI",
    "http://127.0.0.1:8000/auth/soundcloud/callback",
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
# Sign-ups per IP; the end-to-end test run raises it because every test
# registers a fresh account from the same address.
REGISTER_RATE_LIMIT = os.getenv("REGISTER_RATE_LIMIT", "3/minute")


@router.post("/register", responses={400: {"description": "Bad Request"},
                                      403: {"description": "Registration is switched off"}})
@limiter.limit(REGISTER_RATE_LIMIT)
def register(request: Request, data: UserCreate, response: Response,
             db: Annotated[Session, Depends(get_db)]):
    if not runtime_settings.is_feature_enabled("registration", db):
        raise HTTPException(403, "Регистрация временно закрыта")
    data.username = data.username.lower()
    if len(data.username) < 3:
        raise HTTPException(400, "Никнейм слишком короткий")
    if len(data.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Пароль должен быть не менее {MIN_PASSWORD_LENGTH} символов")
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(400, "Никнейм занят")

    # Generate API Key, compute SHA-256 and store in DB
    raw_api_key = secrets.token_hex(16)
    hashed_api_key = hashlib.pbkdf2_hmac('sha256', raw_api_key.encode('utf-8'), SECRET_KEY.encode(), 100000).hex()

    new_user = User(
        username=data.username,
        hashed_password=get_password_hash(
            data.password),
        api_key=hashed_api_key)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    db.add(UserProfile(user_id=new_user.id))
    db.add(UserIntegration(user_id=new_user.id))
    db.commit()

    # Set signed session token in cookie
    session_token = create_session_token(
        str(new_user.id), str(new_user.hashed_password), int(new_user.session_version or 0))
    safe_token = session_token.replace('\r', '').replace('\n', '')
    response.set_cookie(
        key="api_key",
        value=safe_token,
        httponly=True,
        # Set to True in production (HTTPS)
        secure=os.getenv("ENVIRONMENT") == "production",
        samesite="strict",
        max_age=30 * 24 * 3600
    )
    return {"message": "Успешная регистрация", "username": new_user.username, "api_key": raw_api_key}


@router.post("/login", responses={403: {"description": "Second factor required or account banned"}, 400: {"description": "Bad Request"},
                                   429: {"description": "Too many failed attempts"}})
@limiter.limit("5/minute")
def login(request: Request, data: UserLogin, response: Response,
          db: Annotated[Session, Depends(get_db)]):
    data.username = data.username.lower()
    client_ip = get_remote_address(request)
    locked_for = login_guard.seconds_until_unlocked(data.username, client_ip)
    if locked_for:
        raise HTTPException(
            429, f"Слишком много неудачных попыток входа. Попробуйте через {max(locked_for // 60, 1)} мин.")

    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, str(user.hashed_password)):
        login_guard.register_failure(data.username, client_ip)
        raise HTTPException(400, "Неверный логин/пароль")
    if user.is_banned:
        raise HTTPException(403, "Аккаунт заблокирован")
    if user.totp_enabled:
        from app.services.mfa import consume_code
        if not data.otp_code:
            raise HTTPException(403, {"code": "mfa_required", "message": "Введите код из приложения или резервный код"})
        if not consume_code(db, user, data.otp_code):
            login_guard.register_failure(data.username, client_ip)
            raise HTTPException(400, "Неверный или уже использованный код")
        db.commit()
    login_guard.reset(data.username, client_ip)

    # Set signed session token in cookie
    session_token = create_session_token(
        str(user.id), str(user.hashed_password), int(user.session_version or 0))
    safe_token = session_token.replace('\r', '').replace('\n', '')
    response.set_cookie(
        key="api_key",
        value=safe_token,
        httponly=True,
        # Set to True in production
        secure=os.getenv("ENVIRONMENT") == "production",
        samesite="strict",
        max_age=30 * 24 * 3600
    )
    return {"username": user.username}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("api_key")
    return {"message": "Успешный выход"}


@router.post("/logout-all")
def logout_all(response: Response,
               db: Annotated[Session, Depends(get_db)],
               current_user: Annotated[User, Depends(get_current_user)]):
    """Revoke every session of the user (all browsers and devices).

    API keys are not affected; they are managed separately."""
    revoke_all_sessions(current_user)
    db.commit()
    response.delete_cookie("api_key")
    return {"message": "Вы вышли на всех устройствах"}


@router.post("/ws-ticket")
def ws_ticket(current_user: Annotated[User, Depends(get_current_user)]):
    """One-minute ticket for opening a WebSocket as the signed-in user
    (passed as ?ticket=…; see app/core/ws_ticket.py)."""
    from app.core.ws_ticket import TICKET_TTL_SEC, issue_ticket
    return {"ticket": issue_ticket(str(current_user.username), session_version=int(current_user.session_version or 0)), "expires_in": TICKET_TTL_SEC}


SPOTIFY_STATE_COOKIE = "spotify_auth_state"


def _sign_spotify_state(user_id: str, nonce: str) -> str:
    return hmac.new(
        SECRET_KEY.encode("utf-8"),
        f"spotify:{user_id}:{nonce}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _parse_spotify_state(state: str, cookie_nonce: str | None) -> int | None:
    """Validate OAuth state (bound to the initiating browser and user). Returns user id."""
    try:
        user_id, nonce, signature = state.split(".", 2)
    except ValueError:
        return None
    if not cookie_nonce or not secrets.compare_digest(nonce, cookie_nonce):
        return None
    if not hmac.compare_digest(signature, _sign_spotify_state(user_id, nonce)):
        return None
    try:
        return int(user_id)
    except ValueError:
        return None


@router.get("/spotify/login",
            dependencies=[Depends(runtime_settings.require_feature("integration_spotify"))])
def spotify_login(current_user: Annotated[User, Depends(get_current_user)]):
    scopes = "user-read-currently-playing user-read-playback-state"
    nonce = secrets.token_hex(16)
    user_id = str(current_user.id)
    state = f"{user_id}.{nonce}.{_sign_spotify_state(user_id, nonce)}"
    query = urllib.parse.urlencode({
        "client_id": SPOTIFY_CLIENT_ID or "",
        "response_type": "code",
        "redirect_uri": SPOTIFY_REDIRECT_URI,
        "scope": scopes,
        "state": state,
    })
    # The cookie must be set on the response that is actually returned;
    # cookies set on an injected Response are dropped when a Response
    # object is returned directly.
    redirect = RedirectResponse(f"https://accounts.spotify.com/authorize?{query}")
    redirect.set_cookie(
        key=SPOTIFY_STATE_COOKIE,
        value=nonce,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production",
        # Lax so it is sent on the top-level redirect back from Spotify
        samesite="lax",
        max_age=600,
    )
    return redirect


@router.get("/spotify/callback",
            dependencies=[Depends(runtime_settings.require_feature("integration_spotify"))],
            responses={400: {"description": INVALID_STATE_PARAMETER}})
async def spotify_callback(code: str,
                           state: str,
                           request: Request,
                           db: Annotated[Session, Depends(get_db)]):
    # The session cookie is SameSite=Strict and is therefore NOT sent on the
    # cross-site redirect from accounts.spotify.com, so the user is identified
    # through the signed OAuth state bound to the Lax state cookie instead.
    user_id = _parse_spotify_state(state, request.cookies.get(SPOTIFY_STATE_COOKIE))
    if user_id is None:
        raise HTTPException(status_code=400, detail=INVALID_STATE_PARAMETER)

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.is_banned:
        raise HTTPException(status_code=400, detail=INVALID_STATE_PARAMETER)

    result = "error"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post("https://accounts.spotify.com/api/token", data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": SPOTIFY_REDIRECT_URI,
            "client_id": SPOTIFY_CLIENT_ID,
            "client_secret": SPOTIFY_CLIENT_SECRET
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})

        if resp.status_code == 200:
            data = resp.json()
            if data.get("access_token") and data.get("refresh_token"):
                if not user.integration:
                    db.add(UserIntegration(user_id=user.id))
                    db.commit()
                    db.refresh(user)
                user.integration.spotify_access_token = data["access_token"]
                user.integration.spotify_refresh_token = data["refresh_token"]
                db.commit()
                result = "success"

    redirect = RedirectResponse(f"{FRONTEND_URL}/settings?spotify={result}")
    redirect.delete_cookie(SPOTIFY_STATE_COOKIE)
    return redirect


SOUNDCLOUD_STATE_COOKIE = "soundcloud_auth_state"
SOUNDCLOUD_PKCE_COOKIE = "soundcloud_pkce_verifier"


def _sign_soundcloud_state(user_id: str, nonce: str) -> str:
    return hmac.new(
        SECRET_KEY.encode("utf-8"),
        f"soundcloud:{user_id}:{nonce}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _parse_soundcloud_state(state: str, cookie_nonce: str | None) -> int | None:
    try:
        user_id, nonce, signature = state.split(".", 2)
    except ValueError:
        return None
    if not cookie_nonce or not secrets.compare_digest(nonce, cookie_nonce):
        return None
    if not hmac.compare_digest(signature, _sign_soundcloud_state(user_id, nonce)):
        return None
    try:
        return int(user_id)
    except ValueError:
        return None


def _soundcloud_code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


@router.get(
    "/soundcloud/login",
    dependencies=[Depends(runtime_settings.require_feature("integration_soundcloud"))],
    responses={503: {"description": "SoundCloud OAuth is not configured"}},
)
def soundcloud_login(current_user: Annotated[User, Depends(get_current_user)]):
    if not SOUNDCLOUD_CLIENT_ID or not SOUNDCLOUD_CLIENT_SECRET:
        raise HTTPException(503, "SoundCloud OAuth не настроен на сервере")

    nonce = secrets.token_hex(16)
    verifier = secrets.token_urlsafe(64)
    user_id = str(current_user.id)
    state = f"{user_id}.{nonce}.{_sign_soundcloud_state(user_id, nonce)}"
    query = urllib.parse.urlencode({
        "client_id": SOUNDCLOUD_CLIENT_ID,
        "redirect_uri": SOUNDCLOUD_REDIRECT_URI,
        "response_type": "code",
        "code_challenge": _soundcloud_code_challenge(verifier),
        "code_challenge_method": "S256",
        "state": state,
    })
    redirect = RedirectResponse(f"https://secure.soundcloud.com/authorize?{query}")
    secure_cookie = os.getenv("ENVIRONMENT") == "production"
    redirect.set_cookie(
        SOUNDCLOUD_STATE_COOKIE,
        nonce,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=600,
    )
    redirect.set_cookie(
        SOUNDCLOUD_PKCE_COOKIE,
        verifier,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=600,
    )
    return redirect


@router.get(
    "/soundcloud/callback",
    dependencies=[Depends(runtime_settings.require_feature("integration_soundcloud"))],
    responses={400: {"description": INVALID_STATE_PARAMETER}},
)
async def soundcloud_callback(
    code: str,
    state: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    user_id = _parse_soundcloud_state(
        state, request.cookies.get(SOUNDCLOUD_STATE_COOKIE)
    )
    verifier = request.cookies.get(SOUNDCLOUD_PKCE_COOKIE)
    if user_id is None or not verifier:
        raise HTTPException(status_code=400, detail=INVALID_STATE_PARAMETER)

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.is_banned:
        raise HTTPException(status_code=400, detail=INVALID_STATE_PARAMETER)

    result = "error"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            "https://secure.soundcloud.com/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": SOUNDCLOUD_CLIENT_ID,
                "client_secret": SOUNDCLOUD_CLIENT_SECRET,
                "redirect_uri": SOUNDCLOUD_REDIRECT_URI,
                "code_verifier": verifier,
                "code": code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if response.status_code == 200:
        data = response.json()
        if data.get("access_token") and data.get("refresh_token"):
            if not user.integration:
                db.add(UserIntegration(user_id=user.id))
                db.commit()
                db.refresh(user)
            from app.services.cloud_scrobbling import _soundcloud_expiry

            user.integration.soundcloud_access_token = data["access_token"]
            user.integration.soundcloud_refresh_token = data["refresh_token"]
            user.integration.soundcloud_token_expires_at = _soundcloud_expiry(
                data.get("expires_in")
            )
            # The first poll snapshots recent history and never imports it.
            user.integration.soundcloud_recent_tracks = None
            user.integration.soundcloud_current_track = None
            user.integration.soundcloud_track_started_at = None
            db.commit()
            result = "success"

    redirect = RedirectResponse(
        f"{FRONTEND_URL}/settings?tab=integrations&soundcloud={result}"
    )
    redirect.delete_cookie(SOUNDCLOUD_STATE_COOKIE)
    redirect.delete_cookie(SOUNDCLOUD_PKCE_COOKIE)
    return redirect
