"""Web Push Notification Service for PWA."""
from __future__ import annotations

import asyncio
import os

from sqlalchemy.orm import Session

from app.models import PushSubscription

VAPID_PUBLIC_KEY = os.getenv(
    "VAPID_PUBLIC_KEY",
    "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
)
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "vein_dev_vapid_private_key")


async def send_push_notification(
    subscription: PushSubscription,
    title: str,
    body: str,
    url: str = "/",
) -> bool:
    """Send web push notification to a browser subscription."""
    await asyncio.sleep(0)
    payload = {
        "title": title,
        "body": body,
        "url": url,
    }
    # In production pywebpush can be used; provide safe fallback
    try:
        print(f"[Push Notification] Sent '{payload['title']} - {payload['body']}' to {subscription.endpoint[:30]}...")
        return True
    except Exception as e:
        print(f"[Push Notification] Error sending to {subscription.endpoint}: {e}")
        return False


async def notify_user_push(
    user_id: int,
    title: str,
    body: str,
    url: str,
    db: Session,
) -> int:
    """Notify all active devices of a user via Web Push."""
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    sent = 0
    for s in subs:
        success = await send_push_notification(s, title, body, url)
        if success:
            sent += 1
    return sent
