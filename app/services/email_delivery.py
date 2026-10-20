"""Resend delivery with a durable, encrypted outbox; no credentials in responses/logs."""
import hashlib
import html
import json
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session

from app.core.i18n import normalize_lang, tr, user_lang
from app.database import SessionLocal
from app.models import EmailAccount, EmailOutbox, User


def configured():
    return bool(os.getenv("RESEND_API_KEY") and os.getenv("EMAIL_FROM"))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def site_url():
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def queue(db: Session, user_id, kind, recipient, subject, text, link=None, lang="ru"):
    """`subject` and `text` are already in `lang`, the recipient's language."""
    payload = {"to": recipient, "subject": subject, "text": text, "link": link, "lang": lang}
    row = EmailOutbox(id=uuid4().hex, user_id=user_id, kind=kind, payload=json.dumps(payload))
    db.add(row)
    return row


_MONTHS_EN = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def time_text(lang, value):
    """20.10.2026 14:05 in Russian, Oct 20, 2026 14:05 in English."""
    if lang == "en":
        return f"{_MONTHS_EN[value.month - 1]} {value.day}, {value.year} {value:%H:%M}"
    return f"{value:%d.%m.%Y %H:%M}"


def new_login(db, user, device):
    if not configured():
        return
    from app.services.sessions import localized_device

    account = db.get(EmailAccount, user.id)
    if account and account.email and account.security_alerts:
        lang = user_lang(user)
        queue(db, user.id, "security", account.email, tr(lang, "Новый вход в VEIN Music"),
              tr(lang, "В аккаунт {username} вошли с нового устройства: {device}.", username=user.username,
                 device=localized_device(device, lang)) + "\n"
              + tr(lang, "Время: {time} UTC.", time=time_text(lang, datetime.now(UTC))) + "\n"
              + tr(lang, "Если это не вы, смените пароль и завершите другие сеансы."),
              site_url() + "/settings?tab=security", lang=lang)


ACTIONS = {"verify": "Подтвердить почту", "reset": "Задать новый пароль",
           "security": "Проверить устройства", "message": "Открыть VEIN Music"}


def render(payload, kind="message"):
    """Table layout with inline styles: mail clients drop <style> blocks and flexbox."""
    esc = html.escape
    lang = normalize_lang(payload.get("lang")) or "ru"
    paragraphs = "".join(
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#d6d6d3">{esc(line)}</p>'
        for line in payload["text"].split("\n") if line.strip())
    link = payload.get("link")
    action = ""
    if link:
        href = esc(link, quote=True)
        action = (
            '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 22px"><tr>'
            '<td style="border-radius:8px;background:#e3a93b">'
            f'<a href="{href}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;'
            f'color:#121212;text-decoration:none;border-radius:8px">{esc(tr(lang, ACTIONS.get(kind, ACTIONS["message"])))}</a>'
            '</td></tr></table>'
            '<p style="margin:0;font-size:12px;line-height:1.5;color:#8a8b88">'
            f'{esc(tr(lang, "Если кнопка не работает, откройте ссылку:"))}<br>'
            f'<a href="{href}" style="color:#e3a93b;word-break:break-all">{esc(link)}</a></p>')
    site = esc(site_url(), quote=True)
    domain = esc(site_url().split("://")[-1])
    footer = esc(tr(lang, "Это служебное письмо от {domain}.")).replace(
        "{domain}", f'<a href="{site}" style="color:#8a8b88">{domain}</a>')
    return f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light">
<title>{esc(payload["subject"])}</title></head>
<body style="margin:0;padding:0;background:#0e0f10">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{esc(payload["text"].split(chr(10))[0])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0f10">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:'IBM Plex Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<tr><td style="padding:0 4px 18px">
<a href="{site}" style="text-decoration:none;color:#ededeb">
<img src="{site}/icon-192.png" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:6px">
<span style="vertical-align:middle;padding-left:8px;font-size:18px;font-weight:600;color:#ededeb">VEIN<span style="font-weight:400;color:#a3a4a1">Music</span></span></a>
</td></tr>
<tr><td style="background:#16171a;border:1px solid #26282c;border-radius:12px;padding:28px 26px">
<h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;font-weight:600;color:#ededeb">{esc(payload["subject"])}</h1>
{paragraphs}{action}
</td></tr>
<tr><td style="padding:18px 4px 0;font-size:12px;line-height:1.5;color:#6f706d">
{footer}
</td></tr>
</table></td></tr></table></body></html>"""


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


def _quota_exceeded(result):
    try:
        return result.json().get("name") in {"daily_quota_exceeded", "monthly_quota_exceeded"}
    except ValueError:
        return False


def deliver_one(db, row, client):
    """Called under a database row lock; HTTP timeout bounds lock duration."""
    payload = json.loads(row.payload)
    if not _allowed(db, row, payload):
        row.status = "cancelled"
        row.payload = "{}"
        return
    body = {"from": f"VEIN Music <{os.environ['EMAIL_FROM']}>",
            "to": [payload["to"]], "subject": payload["subject"],
            "html": render(payload, row.kind), "text": payload["text"] + ("\n" + payload["link"] if payload.get("link") else ""),
            "tags": [{"name": "kind", "value": row.kind}]}
    if os.getenv("EMAIL_REPLY_TO"):
        body["reply_to"] = os.environ["EMAIL_REPLY_TO"]
    row.attempts += 1
    try:
        result = client.post("https://api.resend.com/emails", json=body,
                             headers={"Authorization": "Bearer " + os.environ["RESEND_API_KEY"], "Idempotency-Key": row.id})
        if result.status_code == 200:
            row.status = "sent"
            row.message_id = str(result.json().get("id", ""))[:254]
            row.error_code = None
            row.payload = "{}"  # don't keep email bodies or actionable tokens after delivery
            return
        row.error_code = f"http_{result.status_code}"
        if result.status_code == 429 and _quota_exceeded(result):
            # The free plan's quota resets at 00:00 UTC; retrying sooner only burns attempts
            row.attempts -= 1
            row.error_code = "quota_exceeded"
            row.next_attempt = (datetime.now(UTC) + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            return
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
