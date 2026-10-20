"""Signing in and linking the account through VK ID (id.vk.ru, OAuth 2.1).

Russian law (149-FZ art. 10.6) wants users from Russia authorised through a
Russian system; VK ID is one. The flow uses PKCE without a client secret, as
VK ID documents for web sites. Only the VK user id is kept: the tokens VK
returns are used once to learn it and then dropped.

Signing in never sets the session cookie on the redirect back from VK: the
callback leaves a short-lived signed ticket in a cookie and sends the browser
to /auth, whose page finishes the sign-in with an ordinary same-site request
(and asks for the 2FA code there when the account has one).
"""
import base64
import hashlib
import hmac
import os
import secrets
import time
import urllib.parse
from typing import Annotated

import httpx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
)
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from slowapi.util import get_remote_address
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import SECRET_KEY, _check_csrf, get_current_user
from app.database import get_db
from app.models import User, UserSession
from app.routers.auth import FRONTEND_URL, set_session_cookie
from app.services import runtime_settings, security_events
from app.services.sessions import current_session_id, issue_session

router = APIRouter(prefix="/auth/vk", tags=["auth"])

VK_CLIENT_ID = os.getenv("VK_CLIENT_ID")
VK_REDIRECT_URI = os.getenv("VK_REDIRECT_URI", "http://127.0.0.1:8000/auth/vk/callback")
# The .ru domain the official VK ID SDK uses since VK moved off vk.com
VK_AUTHORIZE_URL = "https://id.vk.ru/authorize"
VK_TOKEN_URL = "https://id.vk.ru/oauth2/auth"

STATE_COOKIE = "vk_auth_state"
PKCE_COOKIE = "vk_pkce_verifier"
TICKET_COOKIE = "vk_login_ticket"
FLOW_TTL_SEC = 600
TICKET_TTL_SEC = 300

MODE_LOGIN = "login"
MODE_LINK = "link"

require_vk = Depends(runtime_settings.require_feature("login_vk"))


def _secure_cookies() -> bool:
    return os.getenv("ENVIRONMENT") == "production"


def _sign(*parts: str) -> str:
    return hmac.new(SECRET_KEY.encode(), ":".join(("vk-id", *parts)).encode(), hashlib.sha256).hexdigest()


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _parse_state(state: str, cookie_nonce: str | None) -> tuple[str, str] | None:
    """Mode and subject (who started linking; "0" when signing in) of a state
    started by this browser."""
    try:
        mode, subject, nonce, signature = state.split(".", 3)
    except ValueError:
        return None
    if mode not in (MODE_LOGIN, MODE_LINK) or not cookie_nonce:
        return None
    if not secrets.compare_digest(nonce, cookie_nonce):
        return None
    if not hmac.compare_digest(signature, _sign("state", mode, subject, nonce)):
        return None
    return mode, subject


def _link_subject(user: User, session_id: str | None) -> str:
    return f"{user.id}~{int(user.session_version or 0)}~{session_id or ''}"


def _linking_user(db: Session, subject: str) -> User | None:
    """The user who started linking, while the session that started it is
    still valid: revoking it (or logging out everywhere) cancels the flow."""
    try:
        user_id, version, session_id = subject.split("~")
        user = db.get(User, int(user_id))
    except ValueError:
        return None
    if user is None or user.is_banned or str(int(user.session_version or 0)) != version:
        return None
    if session_id and not db.query(UserSession.id).filter(
            UserSession.id == session_id, UserSession.user_id == user.id,
            UserSession.revoked.is_(False)).first():
        return None
    return user


def _issue_ticket(user: User, now: float | None = None) -> str:
    expires = str(int((now if now is not None else time.time()) + TICKET_TTL_SEC))
    user_id, version, vk = str(user.id), str(int(user.session_version or 0)), str(user.vk_id)
    return f"{user_id}.{version}.{vk}.{expires}.{_sign('ticket', user_id, version, vk, expires)}"


def _ticket_user(ticket: str | None, db: Session) -> User | None:
    try:
        user_id, version, vk, expires, signature = (ticket or "").split(".", 4)
        if int(expires) < time.time():
            return None
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _sign("ticket", user_id, version, vk, expires)):
        return None
    user = db.get(User, int(user_id))
    # Logging out everywhere or unlinking VK ID voids a ticket not used yet
    if user is None or str(int(user.session_version or 0)) != version or user.vk_id != vk:
        return None
    return user


def _start(mode: str, subject: str) -> RedirectResponse:
    if not VK_CLIENT_ID:
        raise HTTPException(503, "Вход через VK ID не настроен на сервере")
    nonce = secrets.token_hex(16)
    verifier = secrets.token_urlsafe(64)
    state = f"{mode}.{subject}.{nonce}.{_sign('state', mode, subject, nonce)}"
    query = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": VK_CLIENT_ID,
        "redirect_uri": VK_REDIRECT_URI,
        "state": state,
        "code_challenge": _code_challenge(verifier),
        "code_challenge_method": "S256",
        # Only the id is needed; VK ID asks for nothing beyond the basic scope
        "scope": "vkid.personal_info",
    })
    redirect = RedirectResponse(f"{VK_AUTHORIZE_URL}?{query}")
    for name, value in ((STATE_COOKIE, nonce), (PKCE_COOKIE, verifier)):
        # Lax so they come back with the top-level redirect from VK
        redirect.set_cookie(name, value, httponly=True, secure=_secure_cookies(),
                            samesite="lax", max_age=FLOW_TTL_SEC)
    return redirect


def _vk_user_id(code: str, device_id: str, state: str, verifier: str) -> str | None:
    """Exchange the code for tokens and return the VK user id they belong to."""
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(VK_TOKEN_URL, data={
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": verifier,
                "client_id": VK_CLIENT_ID,
                "device_id": device_id,
                "redirect_uri": VK_REDIRECT_URI,
                "state": state,
            })
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    vk_user = str(response.json().get("user_id") or "")
    return vk_user if vk_user.isdigit() and len(vk_user) <= 32 else None


@router.get("/config")
def vk_config(db: Annotated[Session, Depends(get_db)]):
    """Whether the sign-in page shows the VK ID button."""
    return {"enabled": bool(VK_CLIENT_ID) and runtime_settings.is_feature_enabled("login_vk", db)}


@router.get("/login", dependencies=[require_vk],
            responses={503: {"description": "VK ID is not configured"}})
@limiter.limit("10/minute")
def vk_login(request: Request):
    return _start(MODE_LOGIN, "0")


@router.get("/link", dependencies=[require_vk],
            responses={503: {"description": "VK ID is not configured"}})
def vk_link(request: Request, current_user: Annotated[User, Depends(get_current_user)]):
    return _start(MODE_LINK, _link_subject(current_user, current_session_id(request)))


@router.get("/callback", dependencies=[require_vk])
def vk_callback(request: Request, db: Annotated[Session, Depends(get_db)],
                state: str = "", code: str = "", device_id: str = ""):
    parsed = _parse_state(state, request.cookies.get(STATE_COOKIE))
    verifier = request.cookies.get(PKCE_COOKIE)
    mode = parsed[0] if parsed else MODE_LOGIN
    vk_user = None
    if parsed and verifier and code and device_id:
        vk_user = _vk_user_id(code, device_id, state, verifier)

    if mode == MODE_LINK:
        result = _link(db, parsed[1], vk_user) if parsed else "error"
        redirect = RedirectResponse(f"{FRONTEND_URL}/settings?tab=security&vk={result}")
    else:
        redirect = _login_redirect(db, vk_user)
    redirect.delete_cookie(STATE_COOKIE)
    redirect.delete_cookie(PKCE_COOKIE)
    return redirect


def _link(db: Session, subject: str, vk_user: str | None) -> str:
    user = _linking_user(db, subject)
    if user is None or vk_user is None:
        return "error"
    owner = db.query(User).filter(User.vk_id == vk_user).first()
    if owner is not None and owner.id != user.id:
        return "taken"
    user.vk_id = vk_user  # type: ignore[assignment]
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return "taken"
    return "linked"


def _login_redirect(db: Session, vk_user: str | None) -> RedirectResponse:
    user = db.query(User).filter(User.vk_id == vk_user).first() if vk_user else None
    if vk_user is None:
        return RedirectResponse(f"{FRONTEND_URL}/auth?vk=error")
    if user is None:
        return RedirectResponse(f"{FRONTEND_URL}/auth?vk=unknown")
    if user.is_banned:
        return RedirectResponse(f"{FRONTEND_URL}/auth?vk=banned")
    redirect = RedirectResponse(f"{FRONTEND_URL}/auth?vk=finish")
    redirect.set_cookie(TICKET_COOKIE, _issue_ticket(user), httponly=True, secure=_secure_cookies(),
                        samesite="lax", max_age=TICKET_TTL_SEC)
    return redirect


class VkFinish(BaseModel):
    otp_code: str | None = None


@router.post("/finish", dependencies=[require_vk],
             responses={400: {"description": "No sign-in to finish"},
                        403: {"description": "Second factor required or account banned"}})
@limiter.limit("5/minute")
def vk_finish(request: Request, data: VkFinish, response: Response, background_tasks: BackgroundTasks,
              db: Annotated[Session, Depends(get_db)]):
    """Turn the ticket left by the VK callback into a session."""
    _check_csrf(request, True)
    user = _ticket_user(request.cookies.get(TICKET_COOKIE), db)
    if user is None:
        raise HTTPException(400, "Вход через VK ID устарел, начните заново")
    if user.is_banned:
        raise HTTPException(403, "Аккаунт заблокирован")
    if user.totp_enabled:
        from app.services.mfa import consume_code
        if not data.otp_code:
            raise HTTPException(403, {"code": "mfa_required", "message": "Введите код из приложения или резервный код"})
        if not consume_code(db, user, data.otp_code):
            security_events.record(security_events.LOGIN_FAILED, get_remote_address(request))
            raise HTTPException(400, "Неверный или уже использованный код")
        db.commit()
    response.delete_cookie(TICKET_COOKIE)
    set_session_cookie(response, issue_session(
        db, user, request, response=response, background_tasks=background_tasks))
    return {"username": user.username}


@router.get("/status")
def vk_status(current_user: Annotated[User, Depends(get_current_user)],
              db: Annotated[Session, Depends(get_db)]):
    return {
        "enabled": bool(VK_CLIENT_ID) and runtime_settings.is_feature_enabled("login_vk", db),
        "linked": bool(current_user.vk_id),
    }


@router.post("/unlink")
def vk_unlink(current_user: Annotated[User, Depends(get_current_user)],
              db: Annotated[Session, Depends(get_db)]):
    current_user.vk_id = None  # type: ignore[assignment]
    db.commit()
    return {"message": "VK ID отвязан"}
