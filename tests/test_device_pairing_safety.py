"""Device pairing warns about codes requested from another network and
tells the user when a device got access."""
import pytest

from app.core.security import create_session_token
from app.models import DeviceAuthorization, Notification, User, UserIntegration, UserProfile


@pytest.fixture
def from_ip(monkeypatch):
    address = {"ip": "203.0.113.10"}
    monkeypatch.setattr("app.routers.devices.get_remote_address", lambda request: address["ip"])
    return address


@pytest.fixture
def owner(db):
    user = User(username="pairing_owner", hashed_password="x", profile=UserProfile(),
                integration=UserIntegration())
    db.add(user)
    db.commit()
    return user, {"X-API-Key": create_session_token(str(user.id), "x", int(user.session_version))}


def _code(client):
    return client.post("/api/devices/code", json={"client_name": "Plat Music"}).json()


@pytest.mark.parametrize("approver_ip,same", [
    ("203.0.113.99", True),        # same /24: e.g. the phone and laptop at home
    ("198.51.100.7", False),       # a code someone sent from elsewhere
])
def test_approval_page_compares_networks(client, db, owner, from_ip, approver_ip, same):
    code = _code(client)
    stored = db.query(DeviceAuthorization).one()
    assert stored.requester_network and "203.0.113" not in stored.requester_network
    from_ip["ip"] = approver_ip
    info = client.get(f"/api/devices/code/{code['user_code']}", headers=owner[1]).json()
    assert info["same_network"] is same
    assert info["client_name"] == "Plat Music" and info["created_at"]


def test_ipv6_compares_by_56_prefix(client, owner, from_ip):
    from_ip["ip"] = "2001:db8:aa:bb01::1"
    code = _code(client)
    from_ip["ip"] = "2001:db8:aa:bbff::2"
    assert client.get(f"/api/devices/code/{code['user_code']}", headers=owner[1]).json()["same_network"]
    from_ip["ip"] = "2001:db8:aa:cc00::2"
    assert not client.get(f"/api/devices/code/{code['user_code']}", headers=owner[1]).json()["same_network"]


def test_codes_from_before_the_check_are_unknown(client, db, owner, from_ip):
    code = _code(client)
    db.query(DeviceAuthorization).update({"requester_network": None})
    db.commit()
    assert client.get(f"/api/devices/code/{code['user_code']}", headers=owner[1]).json()["same_network"] is None


def test_approval_leaves_a_security_notification(client, db, owner, from_ip):
    user, headers = owner
    code = _code(client)
    response = client.post("/api/devices/approve", json={"user_code": code["user_code"]}, headers=headers)
    assert response.json()["status"] == "approved"
    note = db.query(Notification).filter_by(user_id=user.id, kind="security").one()
    assert "Plat Music" in note.message


def test_denial_leaves_no_notification(client, db, owner, from_ip):
    user, headers = owner
    code = _code(client)
    client.post("/api/devices/approve", json={"user_code": code["user_code"], "approve": False}, headers=headers)
    assert db.query(Notification).filter_by(user_id=user.id).count() == 0
