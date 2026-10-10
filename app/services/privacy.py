"""Visibility checks shared by feeds, discovery and cached responses."""
import hashlib

from sqlalchemy.orm import Session

from app.models import User, UserProfile
from app.services.user_preferences import preferences_dict


def is_public_section(profile, section: str) -> bool:
    return bool(profile is not None and not profile.is_private
                and preferences_dict(profile)["privacy"].get(section, "all") == "all")


def public_statistics_users(db: Session) -> dict[str, int]:
    rows = db.query(User.username, User.id, UserProfile).join(
        UserProfile, UserProfile.user_id == User.id).filter(
        User.is_banned.isnot(True), UserProfile.is_private.isnot(True)).all()
    return {name: int(user_id) for name, user_id, profile in rows
            if is_public_section(profile, "statistics")}


def filter_public_feed(items: list[dict], db: Session) -> list[dict]:
    """Recheck current preferences even when the history came from cache."""
    names = {item.get("username") for item in items}
    rows = db.query(User.username, UserProfile).join(
        UserProfile, UserProfile.user_id == User.id).filter(
        User.username.in_(names), User.is_banned.isnot(True)).all()
    profiles: dict[str, UserProfile] = dict(rows)  # type: ignore[arg-type]  # SQLAlchemy rows are key/value pairs
    visible = []
    for item in items:
        profile = profiles.get(str(item.get("username") or ""))
        if not is_public_section(profile, "history"):
            continue
        preferences = preferences_dict(profile)
        if not preferences["feed"]["share_scrobbles"]:
            continue
        if item.get("is_playing") and (
            not is_public_section(profile, "current_track")
            or not preferences["profile"]["show_online_status"]
        ):
            continue
        safe = dict(item)
        if not preferences["privacy"]["show_listening_source"]:
            safe["source"] = ""
        safe["can_like"] = preferences["feed"]["allow_likes"]
        safe["can_comment"] = preferences["feed"]["allow_comments"]
        visible.append(safe)
    return visible


def audience_cache_key(prefix: str, ids) -> str:
    """Aggregate caches cannot reuse contributions of a withdrawn listener."""
    digest = hashlib.sha256(",".join(str(uid) for uid in sorted(ids)).encode()).hexdigest()[:24]
    return f"{prefix}:{digest}"
