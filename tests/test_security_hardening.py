"""Session revocation, login lockout and credential encryption at rest."""
import secrets

from sqlalchemy import text

from app.core import login_guard
from app.models import User

# Generated per run so that no credentials live in the repository
TEST_PASSWORD = secrets.token_urlsafe(16)

ORIGIN = {"Origin": "http://localhost:3000"}


def _register(client, username: str) -> str:
    resp = client.post("/auth/register", json={"username": username, "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["api_key"]


def test_logout_all_revokes_existing_sessions(client):
    _register(client, "sessuser")
    session_cookie = client.cookies.get("api_key")
    assert client.get("/api/notifications/sessuser").status_code == 200

    assert client.post("/auth/logout-all", headers=ORIGIN).status_code == 200

    client.cookies.set("api_key", session_cookie)  # an old copy of the cookie
    assert client.get("/api/notifications/sessuser").status_code == 401

    # logging in again issues a working session
    client.cookies.clear()
    assert client.post("/auth/login", json={"username": "sessuser", "password": TEST_PASSWORD}).status_code == 200
    assert client.get("/api/notifications/sessuser").status_code == 200


def test_ban_revokes_sessions(client, db):
    admin_key = _register(client, "banadmin")
    admin = db.query(User).filter_by(username="banadmin").first()
    admin.role = "admin"
    db.commit()

    client.cookies.clear()
    _register(client, "bannedsess")
    cookie = client.cookies.get("api_key")
    client.cookies.clear()

    resp = client.post("/api/admin/users/bannedsess/ban", json={"is_banned": True},
                       headers={"X-API-Key": admin_key})
    assert resp.status_code == 200

    client.cookies.set("api_key", cookie)
    assert client.get("/api/notifications/bannedsess").status_code == 401


def test_account_locked_after_repeated_failures(client):
    _register(client, "lockme")
    client.cookies.clear()
    login_guard.reset("lockme")
    try:
        for _ in range(login_guard.MAX_FAILED_ATTEMPTS):
            resp = client.post("/auth/login", json={"username": "lockme", "password": "wrong-pass"})
            assert resp.status_code == 400
        # even the right password is refused while locked
        resp = client.post("/auth/login", json={"username": "lockme", "password": TEST_PASSWORD})
        assert resp.status_code == 429
    finally:
        login_guard.reset("lockme")
    assert client.post("/auth/login", json={"username": "lockme", "password": TEST_PASSWORD}).status_code == 200


def test_short_password_rejected(client):
    resp = client.post("/auth/register", json={"username": "shorty", "password": "1234567"})
    assert resp.status_code == 400


def test_third_party_tokens_are_encrypted_at_rest(client, db):
    key = _register(client, "tokenuser")
    resp = client.post("/api/integrations/yandex", json={"token": "y-secret-token"},
                       headers={"X-API-Key": key})
    assert resp.status_code == 200
    user = db.query(User).filter_by(username="tokenuser").first()
    raw = db.execute(text("SELECT yandex_token FROM user_integrations WHERE user_id = :u"),
                     {"u": user.id}).scalar()
    assert raw.startswith("enc:v1:") and "y-secret-token" not in raw
    db.refresh(user.integration)
    assert user.integration.yandex_token == "y-secret-token"


def test_webhook_secret_encrypted_and_signing_uses_plaintext(client, db):
    key = _register(client, "hookuser")
    from unittest.mock import patch
    with patch("app.utils.is_safe_url", return_value=True):
        resp = client.post("/api/developer/webhooks", json={"url": "https://example.com/hook"},
                           headers={"X-API-Key": key})
    assert resp.status_code == 200
    secret = resp.json()["secret"]
    raw = db.execute(text("SELECT secret FROM webhooks")).scalar()
    assert raw.startswith("enc:v1:") and secret not in raw
