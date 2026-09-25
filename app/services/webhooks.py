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


def sign_payload(secret: str, payload_bytes: bytes) -> str:
    """Generate HMAC-SHA256 signature for webhook payload."""
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()


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
    ).all()

    if not webhooks:
        return

    delivery_id = str(uuid.uuid4())
    event_timestamp = int(time.time())
    payload = {
        "event": event_name,
        "delivery_id": delivery_id,
        "timestamp": event_timestamp,
        "user_id": user_id,
        "data": data,
    }

    payload_json = json.dumps(payload, ensure_ascii=False)
    payload_bytes = payload_json.encode("utf-8")

    for wh in webhooks:
        subscribed_events = [e.strip() for e in (wh.events or "").split(",") if e.strip()]
        if subscribed_events and event_name not in subscribed_events and "*" not in subscribed_events:
            continue

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
