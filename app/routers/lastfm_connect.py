"""Connect a Last.fm account for scrobble export (Last.fm web authentication).

1. GET /api/integrations/lastfm/connect (signed in) redirects to Last.fm,
   with a signed state bound to this browser through a short-lived cookie.
2. Last.fm redirects back to the callback with a one-time token, which is
   exchanged for a permanent session key (auth.getSession).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import urllib.parse
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.security import SECRET_KEY, get_current_user
from app.database import get_db
from app.models import ExternalSyncConfig, User
from app.services.external_sync import (
    LASTFM_API_KEY,
    LASTFM_API_URL,
    LASTFM_SHARED_SIGNING_SALT,
    _generate_lastfm_signature,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/integrations/lastfm", tags=["integrations"])

STATE_COOKIE = "lastfm_auth_state"
LASTFM_AUTH_URL = "https://www.last.fm/api/auth/"


def _api_base() -> str:
    return os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _sign_state(user_id: str, nonce: str) -> str:
    return hmac.new(SECRET_KEY.encode("utf-8"), f"lastfm:{user_id}:{nonce}".encode("utf-8"),
                    hashlib.sha256).hexdigest()


def _parse_state(state: str, cookie_nonce: str | None) -> int | None:
    try:
        user_id, nonce, signature = state.split(".", 2)
    except ValueError:
        return None
    if not cookie_nonce or not secrets.compare_digest(nonce, cookie_nonce):
        return None
    if not hmac.compare_digest(signature, _sign_state(user_id, nonce)):
        return None
    return int(user_id) if user_id.isdigit() else None


def _configured() -> bool:
    return bool(LASTFM_API_KEY and LASTFM_SHARED_SIGNING_SALT)


@router.get("/connect", responses={503: {"description": "Last.fm API is not configured"}})
def lastfm_connect(current_user: Annotated[User, Depends(get_current_user)]):
    if not _configured():
        raise HTTPException(503, "Last.fm API не настроен на сервере")
    nonce = secrets.token_hex(16)
    user_id = str(current_user.id)
    state = f"{user_id}.{nonce}.{_sign_state(user_id, nonce)}"
    callback = f"{_api_base()}/api/integrations/lastfm/callback?" + urllib.parse.urlencode({"state": state})
    query = urllib.parse.urlencode({"api_key": LASTFM_API_KEY, "cb": callback})
    redirect = RedirectResponse(f"{LASTFM_AUTH_URL}?{query}")
    redirect.set_cookie(
        key=STATE_COOKIE,
        value=nonce,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production",
        samesite="lax",  # sent on the top-level redirect back from Last.fm
        max_age=600,
    )
    return redirect


async def _get_session_key(token: str) -> str | None:
    params = {"method": "auth.getSession", "api_key": LASTFM_API_KEY, "token": token}
    params["api_sig"] = _generate_lastfm_signature(params, LASTFM_SHARED_SIGNING_SALT)
    params["format"] = "json"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(LASTFM_API_URL, params=params)
        data = res.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning(f"[Last.fm] auth.getSession failed: {e}")
        return None
    session = data.get("session") if isinstance(data, dict) else None
    key = session.get("key") if isinstance(session, dict) else None
    return str(key) if key else None


@router.get("/callback", responses={400: {"description": "Invalid state or token"}})
async def lastfm_callback(state: str, token: str, request: Request,
                          db: Annotated[Session, Depends(get_db)]):
    # The session cookie is SameSite=Strict and isn't sent on the redirect
    # from last.fm, so the user comes from the signed state instead.
    user_id = _parse_state(state, request.cookies.get(STATE_COOKIE))
    if user_id is None or not _configured():
        raise HTTPException(400, "Некорректный запрос авторизации Last.fm")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.is_banned:
        raise HTTPException(400, "Некорректный запрос авторизации Last.fm")

    session_key = await _get_session_key(token)
    result = "lastfm_error"
    if session_key:
        config = db.query(ExternalSyncConfig).filter(ExternalSyncConfig.user_id == user.id).first()
        if not config:
            config = ExternalSyncConfig(user_id=user.id)
            db.add(config)
        config.lastfm_session_key = session_key  # type: ignore[assignment]
        config.is_lastfm_enabled = True  # type: ignore[assignment]
        db.commit()
        result = "lastfm_connected"

    redirect = RedirectResponse(f"{_frontend_url()}/settings?tab=export&status={result}")
    redirect.delete_cookie(STATE_COOKIE)
    return redirect
