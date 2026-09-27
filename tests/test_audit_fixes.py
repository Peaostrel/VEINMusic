"""Regressions for the extension and privacy/security audit."""
from datetime import UTC, datetime, timedelta

import pytest
from starlette.websockets import WebSocketDisconnect

from app.models import Scrobble, Track, User


ORIGIN = {"origin": "http://localhost:3000"}


def register(client, username):
    response = client.post("/auth/register", json={"username": username, "password": "test-password-123"})
    assert response.status_code == 200
    return client.cookies.get("api_key")


def listen(db, username, *, ago_seconds=0, playing=True, xp=10):
    user = db.query(User).filter_by(username=username).one()
    track = Track(title=f"Song by {username}", artist=username, duration=100)
    db.add(track)
    db.flush()
    when = datetime.now(UTC) - timedelta(seconds=ago_seconds)
    db.add(Scrobble(user_id=user.id, track_id=track.id, played_at=when,
                    updated_at=when, listened_sec=100, xp_earned=xp,
                    is_playing=playing, source="test"))
    db.commit()


def test_write_only_key_cannot_read_private_websocket(client):
    session = register(client, "scrobble_writer")
    write_key = client.post("/api/developer/keys", headers={"X-API-Key": session},
                            json={"name": "write only", "scopes": "scrobble:write"}).json()["api_key"]
    read_key = client.post("/api/developer/keys", headers={"X-API-Key": session},
                           json={"name": "read", "scopes": "profile:read"}).json()["api_key"]
    client.cookies.clear()

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/scrobble_writer?token={write_key}", headers=ORIGIN):
            pass
    with client.websocket_connect(f"/ws/scrobble_writer?token={read_key}", headers=ORIGIN):
        pass


def test_private_profile_is_visible_to_owner_but_not_a_follower(client, db):
    owner = register(client, "private_owner")
    follower = register(client, "private_follower")
    listen(db, "private_owner")
    assert client.post("/api/follow/private_owner", headers={"X-API-Key": follower},
                       json={}).status_code == 200
    assert client.post("/api/profile/privacy", headers={"X-API-Key": owner},
                       json={"is_private": True}).status_code == 200
    client.cookies.clear()

    owner_profile = client.get("/api/user/private_owner", headers={"X-API-Key": owner}).json()
    follower_profile = client.get("/api/user/private_owner", headers={"X-API-Key": follower}).json()
    assert owner_profile["can_view_private"] is True
    assert follower_profile["can_view_private"] is False
    assert client.get("/api/history/private_owner", headers={"X-API-Key": owner}).status_code == 200
    assert client.get("/api/history/private_owner", headers={"X-API-Key": follower}).status_code == 403
    assert "private_owner" not in [entry["username"] for entry in client.get("/api/leaderboard").json()]


@pytest.mark.parametrize("endpoint", ["/api/profile/privacy", "/api/profile/update"])
def test_privacy_change_invalidates_public_caches(client, db, endpoint):
    owner = register(client, "cache_owner")
    listen(db, "cache_owner", playing=False)
    assert "cache_owner" in [entry["username"] for entry in client.get("/api/leaderboard").json()]
    assert any(entry["username"] == "cache_owner" for entry in client.get("/api/global-history").json())
    assert client.get("/api/public-stats/week").json()["total_plays"] == 1

    response = client.post(endpoint, headers={"X-API-Key": owner}, json={"is_private": True})
    assert response.status_code == 200
    assert "cache_owner" not in [entry["username"] for entry in client.get("/api/leaderboard").json()]
    assert not any(entry["username"] == "cache_owner" for entry in client.get("/api/global-history").json())
    assert client.get("/api/public-stats/week").json()["total_plays"] == 0


def test_online_count_and_now_playing_share_a_recent_playback_window(client, db):
    register(client, "recent_listener")
    register(client, "paused_listener")
    register(client, "stale_listener")
    register(client, "hidden_listener")
    listen(db, "recent_listener", ago_seconds=5)
    listen(db, "paused_listener", ago_seconds=10)
    listen(db, "paused_listener", ago_seconds=5, playing=False)
    listen(db, "stale_listener", ago_seconds=120)
    listen(db, "hidden_listener", ago_seconds=5)
    db.query(User).filter_by(username="hidden_listener").one().profile.is_private = True
    db.commit()

    assert client.get("/api/public-stats").json()["online"] == 1
    assert client.get("/api/current-track/recent_listener").json()["playing"] is True
    assert client.get("/api/current-track/paused_listener").json()["playing"] is False
    assert client.get("/api/current-track/stale_listener").json()["playing"] is False
