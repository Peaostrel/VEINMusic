"""Social notifications: likes and comments on scrobbles, new followers.

Notifications are stored for the in-app list and additionally delivered as
Web Push by the background worker (`send_social_push`).
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Notification, Scrobble, ScrobbleComment, Track, User
from app.services.user_preferences import preferences_dict
from app.services.user_stats import get_user_timezone_offset

logger = logging.getLogger(__name__)

KIND_LIKE = "like"
KIND_COMMENT = "comment"
KIND_FOLLOW = "follow"
# Announcements sent from the admin panel; the actor is the sending admin
KIND_SYSTEM = "system"
KIND_RECAP = "recap"
KINDS = {KIND_LIKE, KIND_COMMENT, KIND_FOLLOW, KIND_SYSTEM, KIND_RECAP}
PREFERENCE_KEYS = {
    KIND_LIKE: "likes",
    KIND_COMMENT: "comments",
    KIND_FOLLOW: "follows",
    KIND_SYSTEM: "system",
    KIND_RECAP: "weekly_digest",
}

MAX_LIST = 50
COMMENT_MATCH_SLACK = timedelta(seconds=5)
EXCERPT_LENGTH = 120


def create(db: Session, *, recipient_id: int, actor_id: int, kind: str,
           scrobble_id: Optional[int] = None, message: Optional[str] = None) -> Optional[Notification]:
    """Add a notification (the caller commits). Returns None when there is
    nothing to notify: own actions, or a repeated like/follow."""
    if kind not in KINDS or recipient_id == actor_id:
        return None
    recipient = db.query(User).filter(User.id == recipient_id).first()
    if recipient and recipient.profile:
        channels = preferences_dict(recipient.profile)["notifications"]
        key = PREFERENCE_KEYS[kind]
        if not channels["in_app"].get(key, True) and not channels["push"].get(key, True):
            return None
    if kind in (KIND_LIKE, KIND_FOLLOW):
        # Toggling a like/follow on and off must not spam the recipient
        exists = db.query(Notification.id).filter(
            Notification.user_id == recipient_id,
            Notification.actor_id == actor_id,
            Notification.kind == kind,
            Notification.scrobble_id == scrobble_id,
        ).first()
        if exists:
            return None
    notification = Notification(
        user_id=recipient_id,
        actor_id=actor_id,
        kind=kind,
        scrobble_id=scrobble_id,
        message=(message or "")[:EXCERPT_LENGTH] or None,
    )
    db.add(notification)
    db.flush()
    return notification


def remove_unread(db: Session, *, recipient_id: int, actor_id: int, kind: str,
                  scrobble_id: Optional[int] = None) -> None:
    """Drop a still-unread notification when its action is undone (unlike / unfollow)."""
    db.query(Notification).filter(
        Notification.user_id == recipient_id,
        Notification.actor_id == actor_id,
        Notification.kind == kind,
        Notification.scrobble_id == scrobble_id,
        Notification.is_read.is_(False),
    ).delete(synchronize_session=False)


def delete_for_user(db: Session, user_id: int) -> None:
    """Remove notifications received or caused by a deleted user."""
    db.query(Notification).filter(
        (Notification.user_id == user_id) | (Notification.actor_id == user_id),
    ).delete(synchronize_session=False)


def _describe(kind: str, actor: str, track_title: Optional[str], message: Optional[str] = None) -> str:
    if kind in (KIND_SYSTEM, KIND_RECAP):
        return message or ""
    target = f"«{track_title}»" if track_title else "ваше прослушивание"
    if kind == KIND_LIKE:
        return f"{actor} оценил(а) {target}"
    if kind == KIND_COMMENT:
        return f"{actor} прокомментировал(а) {target}"
    return f"{actor} подписался(ась) на вас"


def _comment_ids(db: Session, notes: list[Notification]) -> dict[int, int]:
    """{notification id: comment id} for comment notifications, so the
    comment can be reported from the bell. A notification stores only an
    excerpt: the comment is the actor's latest one on that play that starts
    with the excerpt and was made no later than the notification."""
    wanted = [n for n in notes if n.kind == KIND_COMMENT and n.scrobble_id]
    if not wanted:
        return {}
    comments = db.query(ScrobbleComment).filter(
        ScrobbleComment.scrobble_id.in_({n.scrobble_id for n in wanted})).order_by(ScrobbleComment.id.desc()).all()
    found = {}
    for n in wanted:
        for c in comments:
            if c.scrobble_id == n.scrobble_id and c.user_id == n.actor_id \
                    and str(c.content or "").startswith(str(n.message or "")) and (
                    not n.created_at or not c.created_at or c.created_at <= n.created_at + COMMENT_MATCH_SLACK):
                found[int(n.id)] = int(c.id)
                break
    return found


def list_for_user(db: Session, user_id: int, limit: int = MAX_LIST) -> dict[str, Any]:
    user = db.query(User).filter(User.id == user_id).first()
    in_app = preferences_dict(user.profile)["notifications"]["in_app"] if user else {}
    enabled_kinds = [
        kind for kind, key in PREFERENCE_KEYS.items() if in_app.get(key, True)
    ]
    if not enabled_kinds:
        return {"items": [], "unread": 0}
    rows = (
        db.query(Notification, User, Track.title, Track.artist)
        .join(User, User.id == Notification.actor_id)
        .outerjoin(Scrobble, Scrobble.id == Notification.scrobble_id)
        .outerjoin(Track, Track.id == Scrobble.track_id)
        .filter(Notification.user_id == user_id, Notification.kind.in_(enabled_kinds))
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(max(1, min(limit, MAX_LIST)))
        .all()
    )
    unread = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.kind.in_(enabled_kinds),
        Notification.is_read.is_(False)).count()
    comment_ids = _comment_ids(db, [n for n, *_ in rows])
    items = []
    for n, actor, title, artist in rows:
        items.append({
            "id": n.id,
            "kind": n.kind,
            "comment_id": comment_ids.get(int(n.id)),
            "text": _describe(str(n.kind), str(actor.username), title, n.message),
            "message": n.message,
            "actor": {
                "username": actor.username,
                "display_name": (actor.profile.display_name if actor.profile else None) or actor.username,
                "avatar_url": actor.profile.avatar_url if actor.profile else None,
            },
            "track": {"title": title, "artist": artist} if title else None,
            "is_read": bool(n.is_read),
            "created_at": n.created_at.isoformat() if n.created_at else None,
        })
    return {"items": items, "unread": unread}


def mark_read(db: Session, user_id: int, ids: Optional[list[int]] = None) -> int:
    """Mark the given notifications (or all when `ids` is None) as read."""
    query = db.query(Notification).filter(
        Notification.user_id == user_id, Notification.is_read.is_(False))
    if ids is not None:
        query = query.filter(Notification.id.in_(ids))
    return query.update({"is_read": True}, synchronize_session=False)


def _push_payload(notification_id: int) -> Optional[tuple[int, str, str, str]]:
    db = SessionLocal()
    try:
        row = (
            db.query(Notification, User, Track.title)
            .join(User, User.id == Notification.actor_id)
            .outerjoin(Scrobble, Scrobble.id == Notification.scrobble_id)
            .outerjoin(Track, Track.id == Scrobble.track_id)
            .filter(Notification.id == notification_id)
            .first()
        )
        if row is None:
            return None
        n, actor, title = row
        recipient = db.query(User).filter(User.id == n.user_id).first()
        if recipient and not push_allowed(
                recipient, PREFERENCE_KEYS.get(str(n.kind), "system")):
            return None
        body = _describe(str(n.kind), str(actor.username), title)
        if n.message:
            body = f"{body}: {n.message}"
        if n.kind == KIND_FOLLOW:
            url = f"/user/{actor.username}"
        elif n.kind == KIND_RECAP:
            url = f"/user/{actor.username}/stats"
        else:
            url = "/"
        return int(n.user_id), "VEIN Music", body, url
    finally:
        db.close()


def _in_quiet_hours(user: User, start: str, end: str) -> bool:
    offset = get_user_timezone_offset(
        user.profile.location if user.profile else "")
    local_time = datetime.now(UTC).astimezone(
        timezone(timedelta(hours=offset))).strftime("%H:%M")
    if start == end:
        return True
    if start < end:
        return start <= local_time < end
    return local_time >= start or local_time < end


def push_allowed(user: User, preference_key: str) -> bool:
    """Whether this kind of Web Push may be sent right now."""
    settings = preferences_dict(user.profile)["notifications"]
    if not settings["push"].get(preference_key, True):
        return False
    return not (
        settings.get("quiet_hours_enabled")
        and _in_quiet_hours(user, settings["quiet_from"], settings["quiet_to"])
    )


async def send_social_push(notification_id: int) -> None:
    """Deliver one notification as Web Push (no-op when push isn't configured)."""
    import anyio

    from app.services.push_notifications import is_enabled, notify_user_push

    if not is_enabled():
        return
    payload = await anyio.to_thread.run_sync(_push_payload, notification_id)
    if payload is None:
        return
    user_id, title, body, url = payload
    db = SessionLocal()
    try:
        await notify_user_push(user_id, title, body, url, db)
    except Exception as e:
        logger.warning(f"[Notifications] push for {notification_id} failed: {e}")
    finally:
        db.close()


def schedule_push(background_tasks: Any, notification: Optional[Notification]) -> None:
    """Queue the Web Push for a just-committed notification (after the response)."""
    if notification is None or background_tasks is None:
        return
    from app.core.redis import enqueue_background_task
    background_tasks.add_task(enqueue_background_task, "send_social_push", int(notification.id))
