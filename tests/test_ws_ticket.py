import pytest
from starlette.websockets import WebSocketDisconnect

from app.core.ws_ticket import TICKET_TTL_SEC, issue_ticket, verify_ticket

ORIGIN = {"Origin": "http://localhost:3000"}


def _register(client, username: str) -> None:
    resp = client.post("/auth/register", json={"username": username, "password": "password123"},
                       headers=ORIGIN)
    assert resp.status_code == 200


def test_ticket_roundtrip_and_expiry():
    ticket = issue_ticket("some.user", now=1000)
    assert verify_ticket(ticket, now=1000) == "some.user"
    assert verify_ticket(ticket, now=1000 + TICKET_TTL_SEC) == "some.user"
    assert verify_ticket(ticket, now=1001 + TICKET_TTL_SEC) is None


@pytest.mark.parametrize("bad", ["", "nonsense", "alice.notanumber.sig", "alice.99999999999.deadbeef"])
def test_ticket_rejects_garbage(bad):
    assert verify_ticket(bad) is None


def test_ticket_cannot_be_moved_to_another_user():
    user, expires, signature = issue_ticket("alice").rsplit(".", 2)
    assert verify_ticket(f"mallory.{expires}.{signature}") is None


def test_ticket_endpoint_requires_login(client):
    assert client.post("/auth/ws-ticket", headers=ORIGIN).status_code == 401


def test_profile_socket_accepts_ticket_without_cookie(client):
    """Firefox does not send the SameSite=Strict session cookie with a
    WebSocket handshake to the API subdomain; the ticket replaces it."""
    _register(client, "ticketuser")
    ticket = client.post("/auth/ws-ticket", headers=ORIGIN).json()["ticket"]
    client.cookies.clear()

    with client.websocket_connect(f"/ws/ticketuser?ticket={ticket}", headers=ORIGIN) as ws:
        ws.send_json({"type": "PING"})

    # A ticket for one user does not open another user's socket
    _register(client, "otheruser")
    client.cookies.clear()
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/otheruser?ticket={ticket}", headers=ORIGIN) as ws:
            ws.receive_json()


def test_room_socket_identifies_user_by_ticket(client):
    _register(client, "roomticket")
    ticket = client.post("/auth/ws-ticket", headers=ORIGIN).json()["ticket"]
    client.cookies.clear()
    with client.websocket_connect(f"/ws/together/tickets?ticket={ticket}", headers=ORIGIN) as ws:
        assert ws.receive_json()["you"] == "roomticket"
