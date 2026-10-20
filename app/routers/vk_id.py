"""Signing in and linking the account through VK ID (id.vk.ru, OAuth 2.1).

Russian law (149-FZ art. 10.6) wants users from Russia authorised through a
Russian system; VK ID is one. The flow uses PKCE without a client secret, as
VK ID documents for web sites. Only the VK user id is kept: the tokens VK
returns are used once to learn it and then dropped.

Signing in never sets the session cookie on the redirect back from VK: the
callback leaves a short-lived signed ticket in a cookie and sends the browser
to /auth, whose page finishes the sign-in with an ordinary same-site request
(and asks for the 2FA code there when the account has one).

The pages can also show VK's One Tap button (the @vkid/sdk widget): it runs
the same flow in a VK popup with the state and PKCE challenge from /widget,
and the page posts the code it gets to /widget/exchange.
"""
import base64
import hashlib
import hmac
import os
import re
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
    Query,
    Request,
    Response,
)
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from slowapi.util import get_remote_address
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import SECRET_KEY, _check_csrf, get_current_user, get_current_user_optional
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

# Only the id is needed; VK ID asks for nothing beyond the basic scope
VK_SCOPE = "vkid.personal_info"
# The nonce and PKCE verifier of each flow this browser started, so a
# button open in another tab keeps working: "nonce:started:verifier.nonce:..."
FLOW_COOKIE = "vk_auth_flows"
MAX_FLOWS = 5
# What _begin writes; anything else in the cookie is dropped, not written back
FLOW_ENTRY = re.compile(r"([0-9a-f]{32}):([0-9]{10}):([A-Za-z0-9_-]{86})")
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


def _flows(request: Request) -> list[tuple[str, str, str]]:
    """This browser's flows not expired yet, oldest first."""
    flows = []
    for entry in (request.cookies.get(FLOW_COOKIE) or "").split("."):
        match = FLOW_ENTRY.fullmatch(entry)
        if match and int(match[2]) + FLOW_TTL_SEC > time.time():
            flows.append((match[1], match[2], match[3]))
    return flows


def _store_flows(response: Response, flows: list[tuple[str, str, str]]) -> None:
    if not flows:
        response.delete_cookie(FLOW_COOKIE)
        return
    # Lax so it comes back with the top-level redirect from VK
    response.set_cookie(FLOW_COOKIE, ".".join(":".join(f) for f in flows[-MAX_FLOWS:]),
                        httponly=True, secure=_secure_cookies(), samesite="lax", max_age=FLOW_TTL_SEC)


def _take_flow(state: str, request: Request, response: Response) -> tuple[str, str, str] | None:
    """Mode, subject (who started linking; "0" when signing in) and PKCE
    verifier of a state this browser started. The flow is used up."""
    try:
        mode, subject, nonce, signature = state.split(".", 3)
    except ValueError:
        return None
    if mode not in (MODE_LOGIN, MODE_LINK):
        return None
    if not hmac.compare_digest(signature, _sign("state", mode, subject, nonce)):
        return None
    flows = _flows(request)
    found = next((f for f in flows if secrets.compare_digest(f[0], nonce)), None)
    if found is None:
        return None
    _store_flows(response, [f for f in flows if f is not found])
    return mode, subject, found[2]


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


def _begin(mode: str, subject: str, request: Request, response: Response) -> tuple[str, str]:
    """Start a flow: the signed state and the PKCE challenge to send to VK,
    with the nonce and the verifier kept in this browser's cookie."""
    if not VK_CLIENT_ID:
        raise HTTPException(503, "Вход через VK ID не настроен на сервере")
    nonce = secrets.token_hex(16)
    verifier = secrets.token_urlsafe(64)
    _store_flows(response, [*_flows(request), (nonce, str(int(time.time())), verifier)])
    state = f"{mode}.{subject}.{nonce}.{_sign('state', mode, subject, nonce)}"
    return state, _code_challenge(verifier)


def _start(mode: str, subject: str, request: Request) -> RedirectResponse:
    redirect = RedirectResponse(VK_AUTHORIZE_URL)
    state, challenge = _begin(mode, subject, request, redirect)
    redirect.headers["location"] = f"{VK_AUTHORIZE_URL}?" + urllib.parse.urlencode({
        "response_type": "code",
        "client_id": VK_CLIENT_ID,
        "redirect_uri": VK_REDIRECT_URI,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "scope": VK_SCOPE,
    })
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
    return _start(MODE_LOGIN, "0", request)


@router.get("/link", dependencies=[require_vk],
            responses={503: {"description": "VK ID is not configured"}})
def vk_link(request: Request, current_user: Annotated[User, Depends(get_current_user)]):
    return _start(MODE_LINK, _link_subject(current_user, current_session_id(request)), request)


@router.get("/callback", dependencies=[require_vk])
def vk_callback(request: Request, db: Annotated[Session, Depends(get_db)],
                state: str = "", code: str = "", device_id: str = ""):
    redirect = RedirectResponse(FRONTEND_URL)
    flow = _take_flow(state, request, redirect)
    vk_user = None
    if flow and code and device_id:
        vk_user = _vk_user_id(code, device_id, state, flow[2])

    if flow and flow[0] == MODE_LINK:
        result = _link(db, flow[1], vk_user)
        redirect.headers["location"] = f"{FRONTEND_URL}/settings?tab=security&vk={result}"
    else:
        redirect.headers["location"] = f"{FRONTEND_URL}/auth?vk={_login(db, vk_user, redirect)}"
    return redirect


@router.get("/widget", dependencies=[require_vk],
            responses={401: {"description": "Linking needs a signed-in user"},
                       503: {"description": "VK ID is not configured"}})
@limiter.limit("20/minute")
def vk_widget(request: Request, response: Response,
              current_user: Annotated[User | None, Depends(get_current_user_optional)],
              mode: Annotated[str, Query(pattern="^(login|link)$")] = MODE_LOGIN):
    """Settings for the VK ID One Tap button on the page: the button runs
    the sign-in in a VK popup, and the page hands the code to /widget/exchange."""
    if mode == MODE_LINK:
        if current_user is None:
            raise HTTPException(401, "Войдите, чтобы привязать VK ID")
        subject = _link_subject(current_user, current_session_id(request))
    else:
        subject = "0"
    state, challenge = _begin(mode, subject, request, response)
    return {"app_id": int(VK_CLIENT_ID or 0), "redirect_url": VK_REDIRECT_URI, "state": state,
            "code_challenge": challenge, "scope": VK_SCOPE}


class VkWidgetCode(BaseModel):
    code: str = Field(min_length=1, max_length=2048)
    device_id: str = Field(min_length=1, max_length=512)
    state: str = Field(min_length=1, max_length=512)


@router.post("/widget/exchange", dependencies=[require_vk])
@limiter.limit("10/minute")
def vk_widget_exchange(request: Request, data: VkWidgetCode, response: Response,
                       db: Annotated[Session, Depends(get_db)]):
    """Finish what the One Tap button started: link the account, or leave a
    sign-in ticket for /finish. Returns the same results as the redirect flow."""
    _check_csrf(request, True)
    flow = _take_flow(data.state, request, response)
    vk_user = _vk_user_id(data.code, data.device_id, data.state, flow[2]) if flow else None
    if flow and flow[0] == MODE_LINK:
        return {"result": _link(db, flow[1], vk_user)}
    return {"result": _login(db, vk_user, response)}


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


def _login(db: Session, vk_user: str | None, response: Response) -> str:
    """Result of signing in as the VK account: "finish" leaves the ticket
    for /finish in the response's cookies."""
    if vk_user is None:
        return "error"
    user = db.query(User).filter(User.vk_id == vk_user).first()
    if user is None:
        return "unknown"
    if user.is_banned:
        return "banned"
    response.set_cookie(TICKET_COOKIE, _issue_ticket(user), httponly=True, secure=_secure_cookies(),
                        samesite="lax", max_age=TICKET_TTL_SEC)
    return "finish"


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
