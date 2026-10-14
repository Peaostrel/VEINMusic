"""Brevo delivery with a durable, encrypted outbox; no credentials in responses/logs."""
import hashlib
import html
import json
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import EmailAccount, EmailOutbox, User


def configured():
    return bool(os.getenv("BREVO_API_KEY") and os.getenv("EMAIL_FROM"))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def site_url():
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def queue(db: Session, user_id, kind, recipient, subject, text, link=None):
    payload = {"to": recipient, "subject": subject, "text": text, "link": link}
    row = EmailOutbox(id=uuid4().hex, user_id=user_id, kind=kind, payload=json.dumps(payload))
    db.add(row)
    return row


def new_login(db, user, device):
    if not configured():
        return
    account = db.get(EmailAccount, user.id)
    if account and account.email and account.security_alerts:
        queue(db, user.id, "security", account.email, "Новый вход в VEIN Music",
              f"В аккаунт {user.username} вошли с нового устройства: {device}.\n"
              f"Время: {datetime.now(UTC):%d.%m.%Y %H:%M} UTC.\n"
              "Если это не вы, смените пароль и завершите другие сеансы.",
              site_url() + "/settings?tab=security")


def render(payload):
    text = html.escape(payload["text"]).replace("\n", "<br>")
    link = payload.get("link")
    action = f'<p><a href="{html.escape(link, quote=True)}">Открыть VEIN Music</a></p>' if link else ""
    return f'<html lang="ru"><body><h2>VEIN Music</h2><p>{text}</p>{action}</body></html>'


def _allowed(db, row, payload):
    account = db.get(EmailAccount, row.user_id)
    user = db.get(User, row.user_id)
    if not account or not user or user.is_banned:
        return False
    if row.kind in {"security", "message", "reset"} and account.email != payload["to"]:
        return False
    if row.kind == "security":
        return bool(account.security_alerts)
    if row.kind == "message":
        return bool(account.messages_enabled)
    if row.kind == "verify" and account.pending_email != payload["to"]:
        return False
    if row.kind in {"verify", "reset"}:
        expiry = getattr(account, row.kind + "_expires", None)
        token_hash = getattr(account, row.kind + "_hash", None)
        raw = payload.get("link", "").split("#")[-1]
        return bool(expiry and expiry.replace(tzinfo=UTC) > datetime.now(UTC) and token_hash == digest(raw))
    return False


def deliver_one(db, row, client):
    """Called under a database row lock; HTTP timeout bounds lock duration."""
    payload = json.loads(row.payload)
    if not _allowed(db, row, payload):
        row.status = "cancelled"
        row.payload = "{}"
        return
    body = {"sender": {"email": os.environ["EMAIL_FROM"], "name": "VEIN Music"},
            "to": [{"email": payload["to"]}], "subject": payload["subject"],
            "htmlContent": render(payload), "textContent": payload["text"] + ("\n" + payload["link"] if payload.get("link") else ""),
            "headers": {"IdempotencyKey": row.id}, "tags": ["vein-" + row.kind]}
    if os.getenv("EMAIL_REPLY_TO"):
        body["replyTo"] = {"email": os.environ["EMAIL_REPLY_TO"]}
    row.attempts += 1
    try:
        result = client.post("https://api.brevo.com/v3/smtp/email", json=body,
                             headers={"api-key": os.environ["BREVO_API_KEY"]})
        if result.status_code == 201:
            row.status = "sent"
            row.message_id = str(result.json().get("messageId", ""))[:254]
            row.error_code = None
            row.payload = "{}"  # don't keep email bodies or actionable tokens after delivery
            return
        row.error_code = f"http_{result.status_code}"
        permanent = result.status_code in {400, 404, 422}
    except (httpx.HTTPError, ValueError):
        row.error_code = "transport_error"
        permanent = False
    row.status = "failed" if permanent or row.attempts >= 8 else "pending"
    if row.status == "failed":
        row.payload = "{}"
    row.next_attempt = datetime.now(UTC) + timedelta(seconds=min(3600, 60 * 2 ** row.attempts))


def drain():
    with SessionLocal() as db:
        now = datetime.now(UTC)
        db.query(EmailOutbox).filter(EmailOutbox.created_at < now - timedelta(days=30)).delete(synchronize_session=False)
        db.query(EmailOutbox).filter(EmailOutbox.status == "pending", EmailOutbox.created_at < now - timedelta(hours=24)).update(
            {"status": "expired", "payload": "{}"}, synchronize_session=False)
        db.commit()
        if not configured():
            return
        with httpx.Client(timeout=10, follow_redirects=False) as client:
            for _ in range(20):
                row = db.query(EmailOutbox).filter(EmailOutbox.status == "pending", EmailOutbox.next_attempt <= datetime.now(UTC)).order_by(
                    EmailOutbox.created_at).with_for_update(skip_locked=True).first()
                if row is None:
                    break
                deliver_one(db, row, client)
                db.commit()
