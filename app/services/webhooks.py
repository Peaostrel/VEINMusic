"""Outbound Webhook Dispatcher Service with HMAC-SHA256 Signatures."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.safe_http import UnsafeURLError, pinned_request
from app.models import Webhook

logger = logging.getLogger(__name__)

# Upper bound of webhooks per user. Every event is delivered to each of them,
# so without a cap one account could make the server flood a third-party URL.
MAX_WEBHOOKS_PER_USER = 10


def sign_payload(secret: str, payload_bytes: bytes) -> str:
    """Generate HMAC-SHA256 signature for webhook payload."""
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()


def _build_payload(event_name: str, data: dict[str, Any], user_id: int) -> tuple[str, bytes]:
    delivery_id = str(uuid.uuid4())
    payload = {
        "event": event_name,
        "delivery_id": delivery_id,
        "timestamp": int(time.time()),
        "user_id": user_id,
        "data": data,
    }
    return delivery_id, json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _is_subscribed(wh: Webhook, event_name: str) -> bool:
    subscribed_events = [e.strip() for e in (wh.events or "").split(",") if e.strip()]
    return not subscribed_events or event_name in subscribed_events or "*" in subscribed_events


async def _deliver(wh: Webhook, event_name: str, delivery_id: str, payload_bytes: bytes) -> None:
    signature = sign_payload(str(wh.secret), payload_bytes)
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "VEINMusic-Webhooks/2.0",
        "X-VEIN-Event": event_name,
        "X-VEIN-Delivery": delivery_id,
        "X-VEIN-Signature": f"sha256={signature}",
    }

    # The URL is re-validated and the connection pinned to the vetted IP
    # at delivery time (SSRF / DNS rebinding protection); redirects are
    # not followed.
    try:
        await pinned_request("POST", str(wh.url), timeout=4.0, content=payload_bytes, headers=headers)
    except UnsafeURLError:
        logger.warning(f"[Webhook] Blocked delivery to non-public URL {wh.url}")
    except Exception as e:
        logger.warning(f"[Webhook] Failed to deliver {event_name} to {wh.url}: {e}")


async def dispatch_webhook_event(
    event_name: str,
    data: dict[str, Any],
    user_id: int,
    db: Session,
) -> None:
    """Dispatch webhook event to all active user webhooks subscribed to this event."""
    webhooks = db.query(Webhook).filter(
        Webhook.user_id == user_id,
        Webhook.is_active == True,  # noqa: E712
    ).order_by(Webhook.id).limit(MAX_WEBHOOKS_PER_USER).all()

    if not webhooks:
        return

    delivery_id, payload_bytes = _build_payload(event_name, data, user_id)
    for wh in webhooks:
        if _is_subscribed(wh, event_name):
            await _deliver(wh, event_name, delivery_id, payload_bytes)


async def send_test_ping(wh: Webhook, username: str) -> None:
    """Deliver a `ping.test` event to this one webhook only."""
    delivery_id, payload_bytes = _build_payload(
        "ping.test",
        {"message": "VEINMusic Webhook Test Ping", "username": username},
        int(wh.user_id),
    )
    await _deliver(wh, "ping.test", delivery_id, payload_bytes)
