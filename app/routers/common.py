"""Helpers shared by API routers (privacy checks)."""


from fastapi import (
    HTTPException,
    Request,
)
from sqlalchemy.orm import Session

from app.core.constants import USER_NOT_FOUND
from app.core.security import get_current_user
from app.models import (
    Follow,
    User,
)
from app.services.user_preferences import preferences_dict


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


def _can_view_section(
        user: User,
        request: Request,
        db: Session,
        section: str) -> bool:
    """Return whether the requester may see one granular profile section."""
    current_user = _get_request_user(request, db)
    if current_user is not None and current_user.id == user.id:
        return True
    if user.profile and user.profile.is_private:
        return False
    privacy = preferences_dict(user.profile).get("privacy", {})
    visibility = privacy.get(section, "all")
    if visibility == "all":
        return True
    if visibility == "private" or current_user is None:
        return False
    return db.query(Follow.id).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == user.id,
    ).first() is not None


def _get_visible_user(
        username: str,
        request: Request,
        db: Session,
        section: str | None = None) -> User:
    """Return the user if the requester may see their data, else raise 404/403."""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404, USER_NOT_FOUND)
    is_hidden, _ = _check_privacy_and_owner(user, request, db)
    if is_hidden or (section and not _can_view_section(user, request, db, section)):
        raise HTTPException(403, "Это приватный профиль")
    return user
