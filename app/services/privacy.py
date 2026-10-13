"""Visibility checks shared by feeds, discovery and cached responses.

Feeds, search, the top and catalog pages need "who may be shown to
everyone" on every request. Working that out means reading every profile's
preferences, so the two lists are cached briefly and dropped at once
(invalidate_visibility) whenever a preference, a private flag or a ban
changes. The general cache flush is throttled, so it can't be relied on here;
the lists are dropped by a commit hook instead, whatever code made the change.
"""
import hashlib
import json
from functools import lru_cache
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.models import Follow, User, UserProfile
from app.services.cache import delete_from_cache, get_from_cache, set_to_cache

VISIBILITY_TTL_SEC = 30
_PUBLIC_STATISTICS_KEY = "privacy:public_statistics"
_PUBLIC_FEED_KEY = "privacy:public_feed"


@lru_cache(maxsize=1)
def _defaults() -> dict[str, Any]:
    from app.schemas import UserPreferences
    return UserPreferences().model_dump(mode="json")


def light_preferences(profile) -> dict[str, Any]:
    """Preferences merged with defaults per section, without validating them.

    Much cheaper than preferences_dict() for scans over many profiles. A value
    that isn't valid simply isn't "all"/True, so such a section stays hidden."""
    merged = {key: dict(value) if isinstance(value, dict) else value
              for key, value in _defaults().items()}
    try:
        data = json.loads(str(getattr(profile, "preferences", None) or "{}"))
    except (TypeError, ValueError):
        return merged
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(merged.get(key), dict) and isinstance(value, dict):
                merged[key].update(value)
    return merged


def is_public_section(profile, section: str) -> bool:
    return bool(profile is not None and not profile.is_private
                and light_preferences(profile)["privacy"].get(section, "all") == "all")


def invalidate_visibility() -> None:
    """Call after any change to preferences, a private flag or a ban."""
    for key in (_PUBLIC_STATISTICS_KEY, _PUBLIC_FEED_KEY):
        delete_from_cache(key)


def _touches_visibility(obj) -> bool:
    state = inspect(obj)
    if state.pending or state.deleted:
        return True
    if isinstance(obj, UserProfile):
        attrs: tuple[str, ...] = ("preferences", "is_private")
    else:
        attrs = ("is_banned",)
    return any(state.attrs[name].history.has_changes() for name in attrs)


@event.listens_for(Session, "before_flush")
def _watch_visibility_changes(session, _flush_context, _instances) -> None:
    for obj in (*session.new, *session.dirty, *session.deleted):
        if isinstance(obj, (User, UserProfile)) and _touches_visibility(obj):
            session.info["visibility_changed"] = True
            return


@event.listens_for(Session, "after_commit")
def _drop_visibility_after_commit(session) -> None:
    if session.info.pop("visibility_changed", False):
        invalidate_visibility()


@event.listens_for(Session, "after_rollback")
def _forget_rolled_back_changes(session) -> None:
    session.info.pop("visibility_changed", None)


def _public_rows(db: Session):
    return db.query(User.username, User.id, UserProfile.is_private, UserProfile.preferences).join(
        UserProfile, UserProfile.user_id == User.id).filter(
        User.is_banned.isnot(True), UserProfile.is_private.isnot(True)).all()


class _Prefs:
    """Just the two profile columns light_preferences and the checks read."""
    __slots__ = ("is_private", "preferences")

    def __init__(self, is_private, preferences) -> None:
        self.is_private = is_private
        self.preferences = preferences


def public_statistics_users(db: Session) -> dict[str, int]:
    cached = get_from_cache(_PUBLIC_STATISTICS_KEY, ttl=VISIBILITY_TTL_SEC)
    if cached is not None:
        return {str(name): int(uid) for name, uid in cached.items()}
    result = {name: int(user_id) for name, user_id, is_private, prefs in _public_rows(db)
              if is_public_section(_Prefs(is_private, prefs), "statistics")}
    set_to_cache(_PUBLIC_STATISTICS_KEY, result, expire=VISIBILITY_TTL_SEC)
    return result


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
        preferences = light_preferences(profile)
        if preferences["feed"].get("share_scrobbles") is not True:
            continue
        if item.get("is_playing") and (
            not is_public_section(profile, "current_track")
            or preferences["profile"].get("show_online_status") is not True
        ):
            continue
        safe = dict(item)
        if preferences["privacy"].get("show_listening_source") is not True:
            safe["source"] = ""
        safe["can_like"] = preferences["feed"].get("allow_likes") is True
        safe["can_comment"] = preferences["feed"].get("allow_comments") is True
        visible.append(safe)
    return visible


def audience_cache_key(prefix: str, ids) -> str:
    """Aggregate caches cannot reuse contributions of a withdrawn listener."""
    digest = hashlib.sha256(",".join(str(uid) for uid in sorted(ids)).encode()).hexdigest()[:24]
    return f"{prefix}:{digest}"


def visible_statistics_users(db: Session, viewer_id: int | None = None) -> dict[str, int]:
    """Users whose statistics the viewer may see: the public ones, the
    viewer's own and those shared with followers that the viewer follows."""
    visible = dict(public_statistics_users(db))
    if viewer_id is None:
        return visible
    following = {row[0] for row in db.query(Follow.following_id).filter(Follow.follower_id == viewer_id).all()}
    rows = db.query(User.username, User.id, UserProfile).join(
        UserProfile, UserProfile.user_id == User.id).filter(
        User.is_banned.isnot(True), User.id.in_(following | {viewer_id})).all()
    for name, uid, profile in rows:
        if _statistics_visible_to(profile, int(uid), viewer_id, following):
            visible[name] = int(uid)
    return visible


def _statistics_visible_to(profile, user_id, viewer_id, following) -> bool:
    if user_id == viewer_id:
        return True
    if profile.is_private:
        return False
    visibility = light_preferences(profile)["privacy"].get("statistics", "all")
    return visibility == "all" or (visibility == "followers" and user_id in following)


def public_feed_user_ids(db: Session) -> list[int]:
    cached = get_from_cache(_PUBLIC_FEED_KEY, ttl=VISIBILITY_TTL_SEC)
    if cached is not None:
        return [int(uid) for uid in cached]
    result = []
    for _name, uid, is_private, prefs in _public_rows(db):
        profile = _Prefs(is_private, prefs)
        if is_public_section(profile, "history") and light_preferences(profile)["feed"].get("share_scrobbles") is True:
            result.append(int(uid))
    set_to_cache(_PUBLIC_FEED_KEY, result, expire=VISIBILITY_TTL_SEC)
    return result
