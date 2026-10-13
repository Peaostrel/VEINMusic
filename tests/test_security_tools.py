"""Address blocks, refusal statistics, captcha and new-device sign-in alerts."""
import asyncio

import pytest

from app.core.security import create_session_token
from app.models import AdminAuditLog, Notification, User
from app.services import captcha, ip_blocks, security_events

ORIGIN = {"Origin": "http://localhost:3000"}
PASSWORD = "security-tools-pass"


@pytest.fixture
def admin_client(client, db):
    client.headers.update(ORIGIN)
    client.post("/auth/register", json={"username": "guard", "password": PASSWORD})
    boss = db.query(User).filter(User.username == "guard").first()
    boss.role = "admin"
    db.commit()
    client.cookies.clear()
    client.cookies.set("api_key", create_session_token(str(boss.id), str(boss.hashed_password)))
    return client


def _call(ip, kind="http"):
    from app.core.flood_guard import FloodGuardMiddleware

    sent = []

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    scope = {"type": kind, "method": "GET", "path": "/api/leaderboard", "headers": [], "client": (ip, 1)}
    asyncio.run(FloodGuardMiddleware(app)(scope, receive, send))
    return sent[0]


def test_admin_blocks_an_address_for_a_while(admin_client, db):
    response = admin_client.post("/api/admin/security/ip-blocks",
                                 json={"network": "8.8.4.0/24", "hours": 24, "reason": "flood"})
    assert response.status_code == 200, response.text
    block = response.json()
    assert block["network"] == "8.8.4.0/24"
    assert [b["network"] for b in admin_client.get("/api/admin/security/ip-blocks").json()["items"]] == ["8.8.4.0/24"]
    assert db.query(AdminAuditLog).filter_by(action="security.ip_block").count() == 1

    ip_blocks.reset()
    refused = _call("8.8.4.4")
    assert refused["status"] == 403
    assert _call("8.8.8.8")["status"] == 200
    assert _call("8.8.4.4", kind="websocket") == {"type": "websocket.close", "code": 1008}

    assert admin_client.delete(f"/api/admin/security/ip-blocks/{block['id']}").status_code == 200
    ip_blocks.reset()
    assert _call("8.8.4.4")["status"] == 200
    assert admin_client.get("/api/admin/security/ip-blocks").json()["items"] == []
    assert admin_client.delete(f"/api/admin/security/ip-blocks/{block['id']}").status_code == 404


@pytest.mark.parametrize("network, message", [
    ("10.0.0.0/8", "Внутренние"),
    ("172.30.0.10", "Внутренние"),
    ("1.0.0.0/8", "Слишком широкая"),
    ("not-an-ip", "не IP"),
])
def test_dangerous_blocks_are_refused(admin_client, network, message):
    response = admin_client.post("/api/admin/security/ip-blocks", json={"network": network, "hours": 1})
    assert response.status_code == 400
    assert message in response.json()["detail"]


def test_admin_cannot_block_their_own_address():
    with pytest.raises(ip_blocks.BlockError, match="собственный"):
        ip_blocks.parse_network("8.8.8.0/24", admin_ip="8.8.8.8")


def test_blocks_are_for_admins_only(client):
    client.post("/auth/register", json={"username": "not_admin", "password": PASSWORD})
    assert client.get("/api/admin/security/ip-blocks").status_code == 403


def test_failed_logins_show_up_and_alert_admins(admin_client, db, monkeypatch):
    monkeypatch.setitem(security_events.ALERT_THRESHOLDS, security_events.LOGIN_FAILED, 3)
    for _ in range(3):
        response = admin_client.post("/auth/login", json={"username": "guard", "password": "wrong-password"})
        assert response.status_code == 400
    overview = admin_client.get("/api/admin/security/events").json()
    assert overview["series"][-1][security_events.LOGIN_FAILED] == 3
    assert overview["top_addresses"][0]["events"] == 3
    alerts = db.query(Notification).filter(Notification.kind == "security",
                                           Notification.message.like("%атаку%")).all()
    assert len(alerts) == 1  # once, when the threshold is crossed


@pytest.fixture
def captcha_on(monkeypatch):
    monkeypatch.setenv("CAPTCHA_PROVIDER", "turnstile")
    monkeypatch.setenv("CAPTCHA_SITE_KEY", "site-key")
    monkeypatch.setenv("CAPTCHA_SECRET_KEY", "secret-key")
    answers = []
    monkeypatch.setattr(captcha, "_passed", lambda name, token, ip: answers.append(token) or token == "good")
    return answers


def test_captcha_is_off_without_keys(client):
    assert client.get("/auth/captcha").json() == {"provider": None, "site_key": None}
    assert client.post("/auth/register", json={"username": "no_captcha", "password": PASSWORD}).status_code == 200


def test_sign_up_needs_the_captcha_when_it_is_on(client, captcha_on):
    assert client.get("/auth/captcha").json() == {"provider": "turnstile", "site_key": "site-key"}
    missing = client.post("/auth/register", json={"username": "captcha_user", "password": PASSWORD})
    assert missing.status_code == 403
    assert missing.json()["detail"]["code"] == "captcha_required"
    wrong = client.post("/auth/register", json={"username": "captcha_user", "password": PASSWORD,
                                                "captcha_token": "bad"})
    assert wrong.status_code == 403
    ok = client.post("/auth/register", json={"username": "captcha_user", "password": PASSWORD,
                                             "captcha_token": "good"})
    assert ok.status_code == 200


def test_login_asks_for_the_captcha_after_failures(client, captcha_on):
    client.post("/auth/register", json={"username": "captcha_login", "password": PASSWORD,
                                        "captcha_token": "good"})
    client.cookies.clear()
    wrong = {"username": "captcha_login", "password": "wrong-password"}
    # The first attempts need no captcha
    assert [client.post("/auth/login", json=wrong).status_code for _ in range(3)] == [400, 400, 400]
    asked = client.post("/auth/login", json={"username": "captcha_login", "password": PASSWORD})
    assert asked.status_code == 403
    assert asked.json()["detail"]["code"] == "captcha_required"
    ok = client.post("/auth/login", json={"username": "captcha_login", "password": PASSWORD,
                                          "captcha_token": "good"})
    assert ok.status_code == 200


def test_unreachable_captcha_refuses_rather_than_lets_through(client, monkeypatch, captcha_on):
    import httpx

    def down(*args, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(captcha, "_passed", down)
    response = client.post("/auth/register", json={"username": "captcha_down", "password": PASSWORD,
                                                   "captcha_token": "good"})
    assert response.status_code == 503


def _security_messages(db, username):
    user = db.query(User).filter(User.username == username).first()
    return [n.message for n in db.query(Notification).filter(
        Notification.user_id == user.id, Notification.kind == "security").order_by(Notification.id)]


def test_sign_in_from_a_new_device_is_flagged(client, db):
    client.post("/auth/register", json={"username": "device_owner", "password": PASSWORD})
    payload = {"username": "device_owner", "password": PASSWORD}
    # The browser that signed up is known
    assert client.post("/auth/login", json=payload).status_code == 200
    assert "нового устройства" not in _security_messages(db, "device_owner")[-1]

    # Another browser: no device cookie
    client.cookies.clear()
    assert client.post("/auth/login", json=payload).status_code == 200
    assert "нового устройства" in _security_messages(db, "device_owner")[-1]
    assert len(_security_messages(db, "device_owner")) == 2


def test_forged_device_cookie_is_not_trusted(client, db):
    client.post("/auth/register", json={"username": "device_forge", "password": PASSWORD})
    client.cookies.clear()
    client.cookies.set("device_id", "../../etc/passwd")
    assert client.post("/auth/login", json={"username": "device_forge", "password": PASSWORD}).status_code == 200
    assert "нового устройства" in _security_messages(db, "device_forge")[-1]


def test_device_cookie_is_only_ever_made_by_the_server(client):
    response = client.post("/auth/register", json={"username": "device_cookie", "password": PASSWORD})
    issued = response.cookies.get("device_id")
    assert issued is not None
    assert len(issued) == 32
    # A browser that already has one keeps it: nothing is echoed back
    again = client.post("/auth/login", json={"username": "device_cookie", "password": PASSWORD})
    assert "device_id" not in again.cookies
    client.cookies.clear()
    client.cookies.set("device_id", "x" * 40)
    fresh = client.post("/auth/login", json={"username": "device_cookie", "password": PASSWORD})
    assert fresh.cookies.get("device_id") not in (None, "x" * 40)
