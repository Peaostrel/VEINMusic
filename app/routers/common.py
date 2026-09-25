"""Helpers shared by API routers (privacy checks)."""


from fastapi import (
    HTTPException,
    Request,
)
from sqlalchemy.orm import Session

from app.core.constants import USER_NOT_FOUND
from app.core.security import get_current_user
from app.models import (
    User,
)


def _get_request_user(request: Request, db: Session) -> User | None:
    try:
        return get_current_user(request, db)
    except Exception:  # NOSONAR
        return None


def _check_privacy_and_owner(user, request: Request, db: Session) -> tuple[bool, bool]:
    current_u = _get_request_user(request, db)
    is_owner = current_u is not None and current_u.id == user.id
    is_private = bool(user.profile and user.profile.is_private)
    is_hidden = is_private and not is_owner
    return bool(is_hidden), bool(is_owner)


def _get_visible_user(username: str, request: Request, db: Session) -> User:
    """Return the user if the requester may see their data, else raise 404/403."""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404, USER_NOT_FOUND)
    is_hidden, _ = _check_privacy_and_owner(user, request, db)
    if is_hidden:
        raise HTTPException(403, "Это приватный профиль")
    return user
