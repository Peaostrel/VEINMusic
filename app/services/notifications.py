"""Social notifications: likes and comments on scrobbles, new followers.

Notifications are stored for the in-app list and additionally delivered as
Web Push by the background worker (`send_social_push`).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Notification, Scrobble, Track, User

logger = logging.getLogger(__name__)

KIND_LIKE = "like"
KIND_COMMENT = "comment"
KIND_FOLLOW = "follow"
# Announcements sent from the admin panel; the actor is the sending admin
KIND_SYSTEM = "system"
KINDS = {KIND_LIKE, KIND_COMMENT, KIND_FOLLOW, KIND_SYSTEM}

MAX_LIST = 50
EXCERPT_LENGTH = 120


def create(db: Session, *, recipient_id: int, actor_id: int, kind: str,
           scrobble_id: Optional[int] = None, message: Optional[str] = None) -> Optional[Notification]:
    """Add a notification (the caller commits). Returns None when there is
    nothing to notify: own actions, or a repeated like/follow."""
    if kind not in KINDS or recipient_id == actor_id:
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
    if kind == KIND_SYSTEM:
        return message or ""
    target = f"«{track_title}»" if track_title else "ваше прослушивание"
    if kind == KIND_LIKE:
        return f"{actor} оценил(а) {target}"
    if kind == KIND_COMMENT:
        return f"{actor} прокомментировал(а) {target}"
    return f"{actor} подписался(ась) на вас"


def list_for_user(db: Session, user_id: int, limit: int = MAX_LIST) -> dict[str, Any]:
    rows = (
        db.query(Notification, User, Track.title, Track.artist)
        .join(User, User.id == Notification.actor_id)
        .outerjoin(Scrobble, Scrobble.id == Notification.scrobble_id)
        .outerjoin(Track, Track.id == Scrobble.track_id)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(max(1, min(limit, MAX_LIST)))
        .all()
    )
    unread = db.query(Notification).filter(
        Notification.user_id == user_id, Notification.is_read.is_(False)).count()
    items = []
    for n, actor, title, artist in rows:
        items.append({
            "id": n.id,
            "kind": n.kind,
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
        body = _describe(str(n.kind), str(actor.username), title)
        if n.message:
            body = f"{body}: {n.message}"
        url = f"/user/{actor.username}" if n.kind == KIND_FOLLOW else "/"
        return int(n.user_id), "VEIN Music", body, url
    finally:
        db.close()


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
