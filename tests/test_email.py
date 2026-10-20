import json
from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import httpx
from fastapi import Depends
from sqlalchemy.orm import Session
from app.database import get_db
import pytest
from sqlalchemy import text

from app.core.security import get_current_user, get_admin_user, get_password_hash, verify_password
from app.main import app
from app.models import EmailAccount, EmailOutbox, User, UserSession
from app.services import email_delivery as mail
from app.services.sessions import issue_session

PASSWORD = "password-123"


@pytest.fixture
def owner(db, monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    monkeypatch.setenv("EMAIL_FROM", "notifications@example.com")
    u = User(username="mailuser", hashed_password=get_password_hash(PASSWORD), session_version=0)
    db.add(u)
    db.commit()
    def current(session: Session = Depends(get_db)):
        return session.get(User, u.id)
    app.dependency_overrides[get_current_user] = current
    return u


def bind(client, db, owner, address="user@example.com"):
    assert client.post("/api/account/email", json={"email": address, "password": PASSWORD}).status_code == 200
    row = db.query(EmailOutbox).filter_by(kind="verify", status="pending").one()
    return json.loads(row.payload)["link"].split("#")[-1]


def verified(client, db, owner):
    token = bind(client, db, owner)
    assert client.post("/auth/email/verify", json={"token": token}).status_code == 200
    return db.get(EmailAccount, owner.id)


def test_verification_private_single_use(client, db, owner):
    token = bind(client, db, owner)
    account = db.get(EmailAccount, owner.id)
    assert account.email is None
    assert account.verify_hash != token
    stored = db.execute(text("select payload from email_outbox")).scalar_one()
    assert token not in stored
    assert "user@example.com" not in stored
    response = client.get("/api/account/email")
    assert response.headers["cache-control"] == "no-store"
    assert "verify_hash" not in response.json()
    assert client.post("/auth/email/verify", json={"token": token}).status_code == 200
    assert client.post("/auth/email/verify", json={"token": token}).status_code == 400
    db.refresh(account)
    assert account.email == "user@example.com"


def test_disabled_and_wrong_password(client, db, owner, monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY")
    assert client.post("/api/account/email", json={"email": "u@example.com", "password": PASSWORD}).status_code == 503
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    assert client.post("/api/account/email", json={"email": "u@example.com", "password": "wrong"}).status_code == 400
    assert db.query(EmailOutbox).count() == 0


def test_resend_expiry_and_duplicate(client, db, owner):
    first = bind(client, db, owner)
    second = bind(client, db, owner)
    assert client.post("/auth/email/verify", json={"token": first}).status_code == 400
    account = db.get(EmailAccount, owner.id)
    account.verify_expires = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    assert client.post("/auth/email/verify", json={"token": second}).status_code == 400
    other = User(username="other", hashed_password=get_password_hash(PASSWORD))
    db.add(other); db.flush()
    db.add(EmailAccount(user_id=other.id, email="taken@example.com")); db.commit()
    assert client.post("/api/account/email", json={"email": "taken@example.com", "password": PASSWORD}).status_code == 409


def test_password_reset_revokes_sessions_and_cannot_replay(client, db, owner):
    verified(client, db, owner)
    response = client.post("/auth/password/forgot", json={"email": "user@example.com"})
    assert response.json() == client.post("/auth/password/forgot", json={"email": "absent@example.com"}).json()
    message = db.query(EmailOutbox).filter_by(kind="reset").one()
    token = json.loads(message.payload)["link"].split("#")[-1]
    assert client.post("/auth/password/reset", json={"token": token, "password": "new-password"}).status_code == 200
    db.refresh(owner)
    assert verify_password("new-password", owner.hashed_password)
    assert owner.session_version == 1
    assert client.post("/auth/password/reset", json={"token": token, "password": "next-password"}).status_code == 400


def test_reset_does_not_bypass_mfa_or_password_change(client, db, owner, monkeypatch):
    verified(client, db, owner)
    client.post("/auth/password/forgot", json={"email": "user@example.com"})
    token = json.loads(db.query(EmailOutbox).filter_by(kind="reset").one().payload)["link"].split("#")[-1]
    owner.totp_enabled = True; db.commit()
    assert client.post("/auth/password/reset", json={"token": token, "password": "new-password"}).status_code == 400
    owner.totp_enabled = False
    owner.hashed_password = get_password_hash("changed-password")
    db.commit()
    assert client.post("/auth/password/reset", json={"token": token, "password": "new-password"}).status_code == 400


def test_new_device_alert_and_opt_out(client, db, owner):
    account = verified(client, db, owner)
    request = Mock(cookies={}, headers={"user-agent": "Firefox/157 Windows"})
    issue_session(db, owner, request)
    assert db.query(EmailOutbox).filter_by(kind="security").count() == 1
    device = db.query(UserSession).one().device_id
    issue_session(db, owner, Mock(cookies={"device_id": device}, headers={}))
    assert db.query(EmailOutbox).filter_by(kind="security").count() == 1
    account.security_alerts = False; db.commit()
    issue_session(db, owner, request)
    assert db.query(EmailOutbox).filter_by(kind="security").count() == 1


@pytest.mark.parametrize("code,status", [(200, "sent"), (429, "pending"), (503, "pending"), (400, "failed")])
def test_resend_response_and_redaction(client, db, owner, code, status):
    verified(client, db, owner)
    row = mail.queue(db, owner.id, "security", "user@example.com", "Subject", "Hello <script>", "https://example.com")
    db.commit()
    transport = Mock()
    transport.post.return_value = httpx.Response(code, json={"id": "resend-id"})
    mail.deliver_one(db, row, transport); db.commit()
    assert row.status == status
    args = transport.post.call_args
    assert args.args[0] == "https://api.resend.com/emails"
    assert args.kwargs["headers"]["Authorization"] == "Bearer test-key"
    assert args.kwargs["headers"]["Idempotency-Key"] == row.id
    assert args.kwargs["json"]["from"] == "VEIN Music <notifications@example.com>"
    assert "&lt;script&gt;" in args.kwargs["json"]["html"]
    assert row.payload == "{}" if status in {"sent", "failed"} else row.attempts == 1


def test_delivery_cancels_after_opt_out(client, db, owner):
    account = verified(client, db, owner)
    row = mail.queue(db, owner.id, "message", account.email, "Hi", "Hi")
    db.commit()
    transport = Mock()
    mail.deliver_one(db, row, transport)
    assert row.status == "cancelled"
    transport.post.assert_not_called()


def test_admin_permissions_consent_and_unlink(client, db, owner):
    account = verified(client, db, owner)
    body = {"username": "mailuser", "subject": "Hi", "text": "News"}
    assert client.post("/api/admin/email", json=body).status_code == 403
    app.dependency_overrides[get_admin_user] = lambda: owner
    assert client.post("/api/admin/email", json=body).status_code == 400
    client.patch("/api/account/email", json={"security_alerts": True, "messages_enabled": True})
    db.refresh(account)
    assert account.messages_enabled
    assert client.post("/api/admin/email", json=body).status_code == 200
    assert client.request("DELETE", "/api/account/email", json={"password": PASSWORD}).status_code == 200
    db.expire_all()
    assert db.get(EmailAccount, owner.id) is None
    assert db.query(EmailOutbox).filter_by(status="pending").count() == 0


@pytest.mark.parametrize("address", ["bad", "a\r\n@example.com", "a@localhost", "a@b..com"])
def test_invalid_address(client, db, owner, address):
    assert client.post("/api/account/email", json={"email": address, "password": PASSWORD}).status_code == 422


def test_verify_invalid_after_password_change(client, db, owner):
    token = bind(client, db, owner)
    owner.hashed_password = get_password_hash("changed-password")
    db.commit()
    assert client.post("/auth/email/verify", json={"token": token}).status_code == 400


def test_pending_address_does_not_replace_verified_address(client, db, owner):
    verified(client, db, owner)
    token = bind(client, db, owner, "new@example.com")
    assert client.get("/api/account/email").json()["email"] == "user@example.com"
    assert client.post("/auth/email/verify", json={"token": token}).status_code == 200
    assert client.get("/api/account/email").json()["email"] == "new@example.com"


def test_transport_retry_is_bounded(client, db, owner):
    verified(client, db, owner)
    row = mail.queue(db, owner.id, "security", "user@example.com", "Hi", "Hi")
    db.commit()
    transport = Mock()
    transport.post.side_effect = httpx.ConnectError("secret diagnostic detail")
    mail.deliver_one(db, row, transport)
    assert row.status == "pending"
    assert row.error_code == "transport_error"
    assert "secret" not in row.error_code
    row.attempts = 7
    mail.deliver_one(db, row, transport)
    assert row.status == "failed"
    assert row.payload == "{}"


def test_expired_verify_is_not_sent(client, db, owner):
    bind(client, db, owner)
    account = db.get(EmailAccount, owner.id)
    account.verify_expires = datetime.now(UTC) - timedelta(seconds=1)
    row = db.query(EmailOutbox).filter_by(kind="verify").one()
    transport = Mock()
    mail.deliver_one(db, row, transport)
    assert row.status == "cancelled"
    transport.post.assert_not_called()


def test_account_export_and_deletion_remove_email(client, db, owner):
    verified(client, db, owner)
    exported = client.get("/api/account/export").json()
    assert exported["email_settings"]["email"] == "user@example.com"
    assert "verify_hash" not in str(exported)
    assert client.request("DELETE", "/api/account", json={"password": PASSWORD}).status_code == 200
    assert db.query(EmailAccount).count() == 0
    assert db.query(EmailOutbox).count() == 0


def test_disabled_worker_still_purges_expired_data(client, db, owner, monkeypatch):
    row = mail.queue(db, owner.id, "verify", "user@example.com", "Hi", "Hi")
    row.created_at = datetime.now(UTC) - timedelta(days=31)
    db.commit()
    monkeypatch.delenv("RESEND_API_KEY")
    mail.drain()
    db.expire_all()
    assert db.query(EmailOutbox).count() == 0


def test_resend_quota_waits_for_reset(client, db, owner):
    verified(client, db, owner)
    row = mail.queue(db, owner.id, "security", "user@example.com", "Subject", "Hello")
    db.commit()
    transport = Mock()
    transport.post.return_value = httpx.Response(429, json={"name": "daily_quota_exceeded"})
    mail.deliver_one(db, row, transport); db.commit()
    assert (row.status, row.attempts, row.error_code) == ("pending", 0, "quota_exceeded")
    assert row.next_attempt.replace(tzinfo=UTC) > datetime.now(UTC)
    assert (row.next_attempt.hour, row.next_attempt.minute) == (0, 0)
