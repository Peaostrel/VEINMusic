"""Announcements sent from the admin panel to all (or selected) users, as
an in-app notification and/or Web Push."""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Notification, PushSubscription, User
from app.services.notifications import KIND_SYSTEM

logger = logging.getLogger(__name__)

MESSAGE_LENGTH = 200  # Notification.message
PUSH_CONCURRENCY = 10


def compose(title: str, message: str) -> str:
    text = f"{title.strip()}: {message.strip()}" if title.strip() else message.strip()
    return text[:MESSAGE_LENGTH]


def recipient_ids(db: Session, usernames: Optional[list[str]]) -> list[int]:
    """Active (not banned) accounts, all of them or the named ones."""
    query = db.query(User.id).filter(User.is_banned.is_(False))
    if usernames:
        query = query.filter(User.username.in_(usernames))
    return [row[0] for row in query.all()]


def create_inapp(db: Session, admin: User, user_ids: list[int], text: str) -> int:
    """Add a system notification for every recipient (the caller commits)."""
    now = datetime.now(UTC)
    rows = [
        {"user_id": uid, "actor_id": admin.id, "kind": KIND_SYSTEM, "message": text,
         "is_read": False, "created_at": now}
        for uid in user_ids if uid != admin.id
    ]
    if rows:
        db.bulk_insert_mappings(Notification.__mapper__, rows)
    return len(rows)


def _push_targets(user_ids: Optional[list[int]]) -> list[int]:
    db = SessionLocal()
    try:
        query = db.query(PushSubscription.user_id).join(User, User.id == PushSubscription.user_id) \
            .filter(User.is_banned.is_(False))
        if user_ids is not None:
            query = query.filter(PushSubscription.user_id.in_(user_ids))
        return sorted({row[0] for row in query.distinct().all()})
    finally:
        db.close()


async def send_broadcast_push(title: str, body: str, url: str, user_ids: Optional[list[int]] = None) -> int:
    """Web Push to every subscribed recipient. Returns delivered messages."""
    from app.services.push_notifications import is_enabled, notify_user_push

    if not is_enabled():
        return 0
    targets = await asyncio.to_thread(_push_targets, user_ids)
    semaphore = asyncio.Semaphore(PUSH_CONCURRENCY)

    async def deliver(uid: int) -> int:
        async with semaphore:
            db = SessionLocal()
            try:
                return await notify_user_push(uid, title, body, url, db)
            except Exception as e:
                logger.warning(f"[Broadcast] push to user {uid} failed: {e}")
                return 0
            finally:
                db.close()

    sent = sum(await asyncio.gather(*(deliver(uid) for uid in targets)))
    logger.info(f"[Broadcast] push delivered {sent} message(s) to {len(targets)} user(s)")
    return sent
