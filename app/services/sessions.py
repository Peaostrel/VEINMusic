"""Revocable browser sessions. Tokens and IP addresses are never stored."""
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from app.core.security import create_session_token
from app.models import Notification, UserSession


def device_label(user_agent):
    value = (user_agent or "").lower()
    browser = next((label for key, label in (("edg/", "Edge"), ("firefox/", "Firefox"), ("chrome/", "Chrome"), ("safari/", "Safari")) if key in value), "Браузер")
    platform = next((label for key, label in (("android", "Android"), ("iphone", "iPhone"), ("ipad", "iPad"), ("windows", "Windows"), ("macintosh", "macOS"), ("linux", "Linux")) if key in value), "Неизвестное устройство")
    return f"{browser} · {platform}"


def issue_session(db, user, request, notify=True):
    now = datetime.now(UTC)
    row = UserSession(id=uuid4().hex, user_id=user.id, device=device_label(request.headers.get("user-agent")),
                      session_version=int(user.session_version or 0), created_at=now, last_seen_at=now,
                      expires_at=now + timedelta(days=30))
    db.add(row)
    if notify:
        db.add(Notification(user_id=user.id, actor_id=user.id, kind="security",
                            message=f"Новый вход: {row.device}. Проверьте устройства в настройках безопасности."))
    db.commit()
    return create_session_token(str(user.id), str(user.hashed_password), int(user.session_version or 0), str(row.id))


def current_session_id(request):
    token = request.cookies.get("api_key", "")
    parts = token.split(":")
    return parts[2] if len(parts) == 4 else None
