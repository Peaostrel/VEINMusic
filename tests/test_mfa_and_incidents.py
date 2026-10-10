"""Second-factor enforcement, encrypted credentials and atomic incident revocation."""
import json
from datetime import UTC, datetime, timedelta

import pyotp
import pytest
from sqlalchemy import text

from app.core.security import create_session_token, get_password_hash, verify_session_token
from app.core.ws_ticket import issue_ticket, verify_ticket
from app.models import AdminAuditLog, ApiKey, DeviceAuthorization, User, UserIntegration, UserProfile
from app.services import mfa
from app.services.incident_response import revoke_service_sessions


@pytest.fixture
def account(client, db, monkeypatch):
    monkeypatch.setattr(mfa.time, "time", lambda: 1_800_000_000)
    user = User(username="secureuser", hashed_password=get_password_hash("security-password"),
                profile=UserProfile(), integration=UserIntegration())
    db.add(user)
    db.commit()
    client.headers["Origin"] = "http://localhost:3000"
    client.cookies.set("api_key", create_session_token(str(user.id), str(user.hashed_password)))
    return user


def enroll(client):
    setup = client.post("/auth/2fa/setup", json={"password": "security-password"})
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    enabled = client.post("/auth/2fa/enable", json={"code": pyotp.TOTP(secret).at(1_800_000_000)})
    assert enabled.status_code == 200, enabled.text
    return secret, enabled.json()["recovery_codes"]


def test_enrollment_encrypts_secret_revokes_old_sessions_and_redacts_status(client, db, account):
    old = create_session_token(str(account.id), str(account.hashed_password))
    secret, codes = enroll(client)
    db.refresh(account)
    assert account.totp_enabled
    assert not verify_session_token(old, account)
    raw = db.execute(text("SELECT totp_secret FROM users WHERE id = :id"), {"id": account.id}).scalar()
    assert raw.startswith("enc:v1:")
    assert secret not in raw
    assert len(codes) == 8
    assert not any(code in account.totp_recovery_codes for code in codes)
    assert client.get("/auth/2fa/status").json() == {"enabled": True, "required": False}
    assert db.query(AdminAuditLog).filter_by(action="security.2fa_enabled").count() == 1


def test_login_requires_factor_rejects_replay_and_consumes_recovery_once(client, db, account, monkeypatch):
    secret, codes = enroll(client)
    client.cookies.clear()
    login = {"username": "secureuser", "password": "security-password"}
    assert client.post("/auth/login", json=login).json()["detail"]["code"] == "mfa_required"
    assert client.post("/auth/login", json={**login, "otp_code": "invalid"}).status_code == 400
    assert client.post("/auth/login", json={**login, "otp_code": pyotp.TOTP(secret).at(1_800_000_000)}).status_code == 400
    monkeypatch.setattr(mfa.time, "time", lambda: 1_800_000_030)
    code = pyotp.TOTP(secret).at(1_800_000_030)
    assert client.post("/auth/login", json={**login, "otp_code": code}).status_code == 200
    assert client.post("/auth/login", json={**login, "otp_code": code}).status_code == 400
    assert client.post("/auth/login", json={**login, "otp_code": codes[0]}).status_code == 200
    assert client.post("/auth/login", json={**login, "otp_code": codes[0]}).status_code == 400
    db.refresh(account)
    assert len(json.loads(account.totp_recovery_codes)) == 7


def test_setup_password_pending_expiry_and_wrong_code(client, db, account):
    assert client.post("/auth/2fa/setup", json={"password": "wrong"}).status_code == 400
    assert client.post("/auth/2fa/enable", json={"code": "000000"}).status_code == 400
    setup = client.post("/auth/2fa/setup", json={"password": "security-password"})
    account.totp_setup_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    assert client.post("/auth/2fa/enable", json={"code": pyotp.TOTP(setup.json()["secret"]).at(1_800_000_000)}).status_code == 400
    assert not db.get(User, account.id).totp_enabled


def test_administrator_must_enroll_and_cannot_disable_required_factor(client, db, account, monkeypatch):
    monkeypatch.setenv("ADMIN_REQUIRE_2FA", "1")
    account.role = "admin"
    db.commit()
    assert client.get("/api/admin/stats").status_code == 403
    assert client.get("/auth/2fa/status").json()["required"]
    _, codes = enroll(client)
    assert client.get("/api/admin/stats").status_code == 200
    assert client.post("/auth/2fa/disable", json={"password": "security-password", "code": codes[0]}).status_code == 403


def test_disable_requires_password_and_factor_and_revokes_other_sessions(client, db, account):
    _, codes = enroll(client)
    db.refresh(account)
    previous = create_session_token(str(account.id), str(account.hashed_password), int(account.session_version))
    assert client.post("/auth/2fa/disable", json={"password": "wrong", "code": codes[0]}).status_code == 400
    assert client.post("/auth/2fa/disable", json={"password": "security-password", "code": "invalid"}).status_code == 400
    assert client.post("/auth/2fa/disable", json={"password": "security-password", "code": codes[0]}).status_code == 200
    db.refresh(account)
    assert not account.totp_enabled
    assert account.totp_secret is None
    assert not verify_session_token(previous, account)


def test_incident_revocation_preserves_versions_and_optionally_revokes_keys(db, client, account):
    other = User(username="other", hashed_password="fixture", session_version=4, api_key="other-key")
    account.api_key = "personal-key"
    db.add(other)
    db.flush()
    db.add(ApiKey(user_id=account.id, name="Device", key_hash="hash", is_active=True))
    db.add(DeviceAuthorization(device_code_hash="pendinghash", user_code="ABCD-EFGH", status="approved", user_id=account.id,
                               expires_at=datetime.now(UTC) + timedelta(minutes=10), client_name="Fixture"))
    db.commit()
    tokens = [create_session_token(str(u.id), str(u.hashed_password), int(u.session_version)) for u in (account, other)]
    ticket = issue_ticket(str(account.username), session_version=int(account.session_version))
    assert revoke_service_sessions(db, revoke_api_keys=False, reason="test")["users"] == 2
    db.expire_all()
    assert [int(u.session_version) for u in (account, other)] == [1, 5]
    assert not any(verify_session_token(token, user) for token, user in zip(tokens, (account, other)))
    assert verify_ticket(ticket, session_version=int(account.session_version)) is None
    assert account.api_key == "personal-key"
    result = revoke_service_sessions(db, revoke_api_keys=True, reason="incident")
    db.expire_all()
    assert result == {"users": 2, "api_keys": 1, "pairings": 1}
    assert account.api_key is None
    assert not db.query(ApiKey).one().is_active
    assert db.query(DeviceAuthorization).one().status == "denied"
    assert db.query(AdminAuditLog).filter_by(action="security.revoke_all_sessions").count() == 2
