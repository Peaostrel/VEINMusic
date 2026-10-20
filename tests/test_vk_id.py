"""Signing in and linking the account through VK ID."""
import secrets
from unittest.mock import MagicMock, patch

import httpx
import pyotp
import pytest

from app.models import User
from app.routers import vk_id

TEST_PASSWORD = secrets.token_urlsafe(16)
ORIGIN = {"Origin": "http://localhost:3000"}


@pytest.fixture(autouse=True)
def configured():
    with patch.object(vk_id, "VK_CLIENT_ID", "54000000"):
        yield


def _register(client, username: str) -> str:
    resp = client.post("/auth/register", json={"username": username, "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    return client.cookies.get("api_key")


def _through_vk(client, start: str, vk_user: str, headers: dict | None = None) -> httpx.Response:
    """Start a flow, then come back from VK as the given VK account."""
    resp = client.get(start, headers=headers or {}, follow_redirects=False)
    assert resp.status_code in (302, 307), resp.text
    params = httpx.URL(resp.headers["location"]).params
    assert params["code_challenge_method"] == "S256"
    state = params["state"]
    # The redirect from VK is cross-site: only the Lax flow cookies come back
    nonce, verifier = resp.cookies[vk_id.STATE_COOKIE], resp.cookies[vk_id.PKCE_COOKIE]
    client.cookies.clear()
    client.cookies.set(vk_id.STATE_COOKIE, nonce)
    client.cookies.set(vk_id.PKCE_COOKIE, verifier)

    token = MagicMock(status_code=200)
    token.json.return_value = {"access_token": "at", "user_id": int(vk_user)}
    with patch.object(httpx.Client, "post", return_value=token) as post:
        resp = client.get(f"/auth/vk/callback?code=c&device_id=d&type=code_v2&state={state}",
                          follow_redirects=False)
    assert post.call_args.kwargs["data"]["code_verifier"] == verifier
    return resp


def test_link_then_sign_in_with_vk(client, db):
    key = _register(client, "vkuser")
    resp = _through_vk(client, "/auth/vk/link", "777", {"X-API-Key": key})
    assert resp.headers["location"].endswith("/settings?tab=security&vk=linked")
    assert db.query(User).filter_by(username="vkuser").one().vk_id == "777"

    resp = _through_vk(client, "/auth/vk/login", "777")
    assert resp.headers["location"].endswith("/auth?vk=finish")
    assert vk_id.TICKET_COOKIE in resp.headers.get("set-cookie", "")
    assert "api_key" not in client.cookies

    resp = client.post("/auth/vk/finish", json={}, headers=ORIGIN)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"username": "vkuser"}
    session = client.cookies.get("api_key")
    assert session
    assert client.get("/auth/vk/status", headers={"X-API-Key": session}).json()["linked"] is True


def test_unknown_vk_account_does_not_sign_in(client):
    resp = _through_vk(client, "/auth/vk/login", "888")
    assert resp.headers["location"].endswith("/auth?vk=unknown")
    assert client.post("/auth/vk/finish", json={}, headers=ORIGIN).status_code == 400


def test_vk_account_linked_elsewhere_is_refused(client, db):
    first = _register(client, "firstvk")
    _through_vk(client, "/auth/vk/link", "999", {"X-API-Key": first})
    client.cookies.clear()
    second = _register(client, "secondvk")
    resp = _through_vk(client, "/auth/vk/link", "999", {"X-API-Key": second})
    assert resp.headers["location"].endswith("vk=taken")
    assert db.query(User).filter_by(username="secondvk").one().vk_id is None


def test_forged_state_is_rejected(client):
    client.cookies.set(vk_id.STATE_COOKIE, "abc")
    client.cookies.set(vk_id.PKCE_COOKIE, "verifier")
    with patch.object(httpx.Client, "post") as post:
        resp = client.get("/auth/vk/callback?code=c&device_id=d&state=login.0.abc.forged",
                          follow_redirects=False)
    post.assert_not_called()
    assert resp.headers["location"].endswith("/auth?vk=error")


def test_forged_ticket_is_rejected(client, db):
    _register(client, "tickettarget")
    user = db.query(User).filter_by(username="tickettarget").one()
    client.cookies.clear()
    client.cookies.set(vk_id.TICKET_COOKIE, f"{user.id}.0.9999999999.forged")
    assert client.post("/auth/vk/finish", json={}, headers=ORIGIN).status_code == 400


def test_two_factor_account_needs_its_code(client, db):
    key = _register(client, "vkmfa")
    _through_vk(client, "/auth/vk/link", "4242", {"X-API-Key": key})
    user = db.query(User).filter_by(username="vkmfa").one()
    secret = pyotp.random_base32()
    user.totp_secret = secret
    user.totp_enabled = True
    db.commit()

    _through_vk(client, "/auth/vk/login", "4242")
    resp = client.post("/auth/vk/finish", json={}, headers=ORIGIN)
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "mfa_required"
    assert "api_key" not in client.cookies
    resp = client.post("/auth/vk/finish", json={"otp_code": pyotp.TOTP(secret).now()}, headers=ORIGIN)
    assert resp.status_code == 200, resp.text


def test_unlink(client, db):
    key = _register(client, "vkunlink")
    _through_vk(client, "/auth/vk/link", "5151", {"X-API-Key": key})
    assert client.post("/auth/vk/unlink", headers={"X-API-Key": key}).status_code == 200
    assert db.query(User).filter_by(username="vkunlink").one().vk_id is None


def test_not_configured(client):
    with patch.object(vk_id, "VK_CLIENT_ID", None):
        assert client.get("/auth/vk/config").json() == {"enabled": False}
        assert client.get("/auth/vk/login", follow_redirects=False).status_code == 503
