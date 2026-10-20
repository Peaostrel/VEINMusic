"""Signing in and linking the account through VK ID."""
import secrets
import time
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
    flows = resp.cookies[vk_id.FLOW_COOKIE]
    verifier = flows.rsplit(":", 1)[1]
    client.cookies.clear()
    client.cookies.set(vk_id.FLOW_COOKIE, flows)

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
    client.cookies.set(vk_id.FLOW_COOKIE, f"abc:{int(time.time())}:verifier")
    with patch.object(httpx.Client, "post") as post:
        resp = client.get("/auth/vk/callback?code=c&device_id=d&state=login.0.abc.forged",
                          follow_redirects=False)
    post.assert_not_called()
    assert resp.headers["location"].endswith("/auth?vk=error")


def test_forged_ticket_is_rejected(client, db):
    _register(client, "tickettarget")
    user = db.query(User).filter_by(username="tickettarget").one()
    client.cookies.clear()
    client.cookies.set(vk_id.TICKET_COOKIE, f"{user.id}.0.1.9999999999.forged")
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


def test_logging_out_everywhere_cancels_a_pending_link(client, db):
    key = _register(client, "vkrevoked")
    resp = client.get("/auth/vk/link", headers={"X-API-Key": key}, follow_redirects=False)
    state = httpx.URL(resp.headers["location"]).params["state"]
    flows = resp.cookies[vk_id.FLOW_COOKIE]
    assert client.post("/auth/logout-all", headers={"X-API-Key": key, **ORIGIN}).status_code == 200

    client.cookies.clear()
    client.cookies.set(vk_id.FLOW_COOKIE, flows)
    token = MagicMock(status_code=200)
    token.json.return_value = {"user_id": 6161}
    with patch.object(httpx.Client, "post", return_value=token):
        resp = client.get(f"/auth/vk/callback?code=c&device_id=d&state={state}", follow_redirects=False)
    assert resp.headers["location"].endswith("vk=error")
    assert db.query(User).filter_by(username="vkrevoked").one().vk_id is None


def test_unlinking_voids_a_pending_sign_in(client, db):
    key = _register(client, "vkticket")
    _through_vk(client, "/auth/vk/link", "7171", {"X-API-Key": key})
    _through_vk(client, "/auth/vk/login", "7171")
    user = db.query(User).filter_by(username="vkticket").one()
    user.vk_id = None
    db.commit()
    assert client.post("/auth/vk/finish", json={}, headers=ORIGIN).status_code == 400


def _through_widget(client, mode: str, vk_user: str, headers: dict | None = None) -> httpx.Response:
    """The One Tap button: settings from /widget, then the code from VK's popup."""
    resp = client.get(f"/auth/vk/widget?mode={mode}", headers=headers or {})
    assert resp.status_code == 200, resp.text
    widget = resp.json()
    assert widget["app_id"] == 54000000
    assert widget["code_challenge"]
    # The test client is an httpx.Client itself, so the exchange is replaced
    # one level up; the redirect-flow tests above cover the request to VK
    with patch.object(vk_id, "_vk_user_id", return_value=vk_user) as exchange:
        resp = client.post("/auth/vk/widget/exchange", headers={**ORIGIN, **(headers or {})},
                           json={"code": "c", "device_id": "d", "state": widget["state"]})
    code, device, state, verifier = exchange.call_args.args
    assert (code, device, state) == ("c", "d", widget["state"])
    assert verifier
    return resp


def test_one_tap_links_and_signs_in(client, db):
    key = _register(client, "onetap")
    assert _through_widget(client, "link", "8181", {"X-API-Key": key}).json() == {"result": "linked"}
    assert db.query(User).filter_by(username="onetap").one().vk_id == "8181"

    client.cookies.clear()
    assert _through_widget(client, "login", "8181").json() == {"result": "finish"}
    resp = client.post("/auth/vk/finish", json={}, headers=ORIGIN)
    assert resp.json() == {"username": "onetap"}


def test_one_tap_rejects_a_state_from_another_browser(client):
    widget = client.get("/auth/vk/widget?mode=login").json()
    client.cookies.clear()
    client.cookies.set(vk_id.FLOW_COOKIE, f"other:{int(time.time())}:verifier")
    with patch.object(vk_id, "_vk_user_id") as exchange:
        resp = client.post("/auth/vk/widget/exchange", headers=ORIGIN,
                           json={"code": "c", "device_id": "d", "state": widget["state"]})
    exchange.assert_not_called()
    assert resp.json() == {"result": "error"}


def test_one_tap_linking_needs_a_signed_in_user(client):
    assert client.get("/auth/vk/widget?mode=link").status_code == 401


def test_one_tap_in_two_tabs(client):
    first = client.get("/auth/vk/widget?mode=login").json()
    second = client.get("/auth/vk/widget?mode=login").json()
    with patch.object(vk_id, "_vk_user_id", return_value="9191") as exchange:
        resp = client.post("/auth/vk/widget/exchange", headers=ORIGIN,
                           json={"code": "c", "device_id": "d", "state": first["state"]})
    assert resp.json() == {"result": "unknown"}
    verifier = exchange.call_args.args[3]
    assert vk_id._code_challenge(verifier) == first["code_challenge"]

    # Each flow is used once; the other tab's flow is still there
    with patch.object(vk_id, "_vk_user_id", return_value="9191") as exchange:
        client.post("/auth/vk/widget/exchange", headers=ORIGIN,
                    json={"code": "c", "device_id": "d", "state": first["state"]})
        exchange.assert_not_called()
        client.post("/auth/vk/widget/exchange", headers=ORIGIN,
                    json={"code": "c", "device_id": "d", "state": second["state"]})
    assert vk_id._code_challenge(exchange.call_args.args[3]) == second["code_challenge"]


def test_flow_cookie_drops_what_the_server_did_not_write(client):
    client.cookies.set(vk_id.FLOW_COOKIE, f"abc:{int(time.time())}:x")
    resp = client.get("/auth/vk/widget?mode=login")
    flows = resp.cookies[vk_id.FLOW_COOKIE]
    assert flows.startswith(resp.json()["state"].split(".")[2])
    assert "." not in flows


def test_flow_cookie_keeps_the_newest_flows(client):
    states = [client.get("/auth/vk/widget?mode=login").json()["state"]
              for _ in range(vk_id.MAX_FLOWS + 1)]
    flows = client.cookies.get(vk_id.FLOW_COOKIE)
    nonces = [entry.split(":")[0] for entry in flows.split(".")]
    assert nonces == [state.split(".")[2] for state in states[1:]]
