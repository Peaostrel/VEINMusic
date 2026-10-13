"""Revocable browser sessions. Tokens and IP addresses are never stored."""
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from app.core.security import create_session_token
from app.models import Notification, UserSession


def device_label(user_agent):
    value = (user_agent or "").lower()
    browser = next((label for key, label in (("edg/", "Edge"), ("firefox/", "Firefox"), ("chrome/", "Chrome"), ("safari/", "Safari")) if key in value), "Браузер")
    platform = next((label for key, label in (("android", "Android"), ("iphone", "iPhone"), ("ipad", "iPad"), ("windows", "Windows"), ("macintosh", "macOS"), ("linux", "Linux")) if key in value), "Неизвестное устройство")
    return f"{browser} · {platform}"


DEVICE_COOKIE = "device_id"
DEVICE_COOKIE_MAX_AGE = 2 * 365 * 24 * 3600
_HEX = set("0123456789abcdef")


def _known_device_id(request) -> str | None:
    """The browser's device id, if it carries a well-formed one."""
    value = request.cookies.get(DEVICE_COOKIE, "")
    return value if len(value) == 32 and set(value) <= _HEX else None


def issue_session(db, user, request, notify=True, response=None, background_tasks=None):
    from app.services import notifications

    now = datetime.now(UTC)
    # The cookie is only ever set to an id made here, never echoed back
    new_device_id = None
    device_id = _known_device_id(request)
    if device_id is None:
        device_id = new_device_id = uuid4().hex
    known_device = new_device_id is None and db.query(UserSession.id).filter(
        UserSession.user_id == user.id, UserSession.device_id == device_id).first() is not None
    row = UserSession(id=uuid4().hex, user_id=user.id, device=device_label(request.headers.get("user-agent")),
                      device_id=device_id, session_version=int(user.session_version or 0),
                      created_at=now, last_seen_at=now, expires_at=now + timedelta(days=30))
    db.add(row)
    alert = None
    if notify and known_device:
        db.add(Notification(user_id=user.id, actor_id=user.id, kind="security",
                            message=f"Новый вход: {row.device}. Проверьте устройства в настройках безопасности."))
    elif notify:
        # A browser that never signed in to this account: worth a push, since
        # it is what a stolen password looks like
        alert = notifications.create(
            db, recipient_id=int(user.id), actor_id=int(user.id), kind=notifications.KIND_SECURITY,
            message=f"Вход с нового устройства: {row.device}. Не вы? Смените пароль и завершите сеансы")
    db.commit()
    notifications.schedule_push(background_tasks, alert)
    if response is not None and new_device_id is not None:
        response.set_cookie(DEVICE_COOKIE, new_device_id, max_age=DEVICE_COOKIE_MAX_AGE, httponly=True,
                            secure=os.getenv("ENVIRONMENT") == "production", samesite="strict")
    return create_session_token(str(user.id), str(user.hashed_password), int(user.session_version or 0), str(row.id))


def current_session_id(request):
    token = request.cookies.get("api_key", "")
    parts = token.split(":")
    return parts[2] if len(parts) == 4 else None
