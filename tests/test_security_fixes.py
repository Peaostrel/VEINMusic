"""Regression tests for security / privacy fixes found during the audit."""
import asyncio
import secrets
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from starlette.websockets import WebSocketDisconnect

from app.models import (
    Follow,
    Scrobble,
    Track,
    User,
    UserAchievement,
)
from app.routers.widgets import _render_now_playing_svg
from app.services.cloud_scrobbling import get_pollable_user_ids
from app.services.scrobble_processor import _get_or_create_track, _update_scrobble_progress
from app.utils import is_safe_url, sanitize_text

# Generated per run so that no credentials live in the repository
TEST_PASSWORD = secrets.token_urlsafe(16)

ORIGIN = {"Origin": "http://localhost:3000"}


def _register(client, username: str) -> str:
    resp = client.post("/auth/register", json={"username": username, "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    # A session token: full access, unlike the personal key in the response
    # body, which is limited to sending scrobbles and reading.
    return client.cookies.get("api_key")


def _auth(key: str) -> dict:
    return {"X-API-Key": key}


def _add_listened_scrobble(db, user_id: int, title="Secret Song", artist="Secret Artist"):
    track = Track(title=title, artist=artist, duration=100)
    db.add(track)
    db.commit()
    db.add(Scrobble(user_id=user_id, track_id=track.id, listened_sec=100,
                    is_playing=False, source="yandex"))
    db.commit()
    return track


# --- Privacy settings are not reset by unrelated profile updates ---

def test_profile_update_does_not_reset_privacy(client, db):
    key = _register(client, "alice")
    resp = client.post("/api/profile/privacy", headers=_auth(key),
                       json={"is_private": True, "sync_privacy": "none", "hidden_artists": "X"})
    assert resp.status_code == 200

    resp = client.post("/api/profile/update", headers=_auth(key), json={"bio": "hello"})
    assert resp.status_code == 200

    user = db.query(User).filter_by(username="alice").first()
    db.refresh(user.profile)
    assert user.profile.is_private is True
    assert user.profile.sync_privacy == "none"
    assert user.profile.hidden_artists == "X"


def test_sync_privacy_is_validated(client):
    key = _register(client, "valid")
    resp = client.post("/api/profile/privacy", headers=_auth(key), json={"sync_privacy": "whatever"})
    assert resp.status_code == 422


# --- Bans are enforced ---

def test_banned_user_is_rejected(client, db):
    key = _register(client, "bob")
    user = db.query(User).filter_by(username="bob").first()
    user.is_banned = True
    db.commit()

    resp = client.post("/api/profile/update", headers=_auth(key), json={"bio": "still here"})
    assert resp.status_code == 403


# --- Developer API key scopes ---

def test_developer_key_scopes_are_enforced(client):
    key = _register(client, "dave")
    resp = client.post("/api/developer/keys", headers=_auth(key),
                       json={"name": "ro", "scopes": "profile:read"})
    assert resp.status_code == 200
    dev_key = resp.json()["api_key"]

    # read access works
    assert client.get("/api/recommendations/me", headers=_auth(dev_key)).status_code == 200
    # writes and account management are refused
    assert client.post("/api/profile/update", headers=_auth(dev_key), json={"bio": "x"}).status_code == 403
    assert client.post("/api/developer/keys", headers=_auth(dev_key),
                       json={"name": "escalate", "scopes": "*"}).status_code == 403


def test_scrobble_scope_allows_only_scrobbling(client):
    key = _register(client, "erin")
    dev_key = client.post("/api/developer/keys", headers=_auth(key),
                          json={"name": "w", "scopes": "scrobble:write"}).json()["api_key"]
    assert client.post("/api/profile/update", headers=_auth(dev_key), json={"bio": "x"}).status_code == 403
    assert client.get("/api/recommendations/me", headers=_auth(dev_key)).status_code == 403


def test_invalid_scopes_rejected(client):
    key = _register(client, "frank")
    resp = client.post("/api/developer/keys", headers=_auth(key),
                       json={"name": "bad", "scopes": "admin:all"})
    assert resp.status_code == 400


# --- SSRF protection ---

@pytest.mark.parametrize("url", [
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://10.0.0.5/",
    "http://0.0.0.0/",
    "http://localhost/",
    "ftp://example.com/",
    "javascript:alert(1)",
])
def test_is_safe_url_blocks_internal_targets(url):
    assert is_safe_url(url) is False


def test_webhook_to_internal_address_rejected(client):
    key = _register(client, "gina")
    resp = client.post("/api/developer/webhooks", headers=_auth(key),
                       json={"url": "http://169.254.169.254/latest/meta-data/"})
    assert resp.status_code == 400


# --- Private profiles don't leak listening data ---

@pytest.mark.parametrize("path", [
    "/api/stats/henry",
    "/api/detailed-stats/henry",
    "/api/activity/henry",
    "/api/stats/wrapped?username=henry",
    "/api/user/mood?username=henry",
    "/api/recommendations?username=henry",
    "/api/achievements/all/henry",
    "/api/recommendations/user/henry",
])
def test_private_profile_hidden_from_others(client, db, path):
    key = _register(client, "henry")
    client.post("/api/profile/privacy", headers=_auth(key), json={"is_private": True})
    user = db.query(User).filter_by(username="henry").first()
    _add_listened_scrobble(db, user.id)

    client.cookies.clear()
    resp = client.get(path)
    assert resp.status_code == 403
    assert "Secret" not in resp.text

    # the owner still has access
    assert client.get(path, headers=_auth(key)).status_code == 200


def test_private_profile_current_track_and_taste_match(client, db):
    key = _register(client, "ivan")
    other_key = _register(client, "jane")
    client.post("/api/profile/privacy", headers=_auth(key), json={"is_private": True})
    ivan = db.query(User).filter_by(username="ivan").first()
    jane = db.query(User).filter_by(username="jane").first()
    _add_listened_scrobble(db, ivan.id)
    db.add(Scrobble(user_id=jane.id, track_id=db.query(Track).first().id,
                    listened_sec=100, is_playing=False, source="yandex"))
    db.commit()
    client.cookies.clear()

    assert client.get("/api/current-track/ivan").json() == {"playing": False}
    match = client.get("/api/taste-match/jane/ivan", headers=_auth(other_key)).json()
    assert match["common_artists"] == []
    assert client.get("/api/user/jane/compatibility/ivan", headers=_auth(other_key)).status_code == 403


def test_notifications_require_owner(client):
    key = _register(client, "kate")
    _register(client, "leo")
    client.cookies.clear()
    assert client.get("/api/notifications/kate").status_code == 401
    assert client.get("/api/notifications/leo", headers=_auth(key)).status_code == 403
    assert client.get("/api/notifications/kate", headers=_auth(key)).status_code == 200


def test_owner_sees_own_private_followers(client, db):
    key = _register(client, "mia")
    other = _register(client, "nick")
    assert client.post("/api/follow/mia", headers=_auth(other), json={}).status_code == 200
    client.post("/api/profile/privacy", headers=_auth(key), json={"is_private": True})
    client.cookies.clear()

    assert client.get("/api/followers/mia").json() == []
    owner_view = client.get("/api/followers/mia", headers=_auth(key)).json()
    assert [u["username"] for u in owner_view] == ["nick"]


def test_user_info_does_not_expose_key_hash(client):
    key = _register(client, "olga")
    data = client.get("/api/user/olga", headers=_auth(key)).json()
    assert "api_key" not in data
    assert data["has_api_key"] is True


# --- Spotify OAuth flow ---

def test_spotify_login_sets_state_cookie_and_callback_links_account(client, db):
    key = _register(client, "pavel")
    resp = client.get("/auth/spotify/login", headers=_auth(key), follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert "spotify_auth_state" in resp.headers.get("set-cookie", "")
    state = httpx.URL(resp.headers["location"]).params["state"]

    # Callback arrives cross-site: no session cookie, only the Lax state cookie
    nonce = client.cookies.get("spotify_auth_state")
    client.cookies.clear()
    client.cookies.set("spotify_auth_state", nonce)

    token_resp = MagicMock(status_code=200)
    token_resp.json.return_value = {"access_token": "at", "refresh_token": "rt"}
    with patch.object(httpx.AsyncClient, "post", new=AsyncMock(return_value=token_resp)):
        resp = client.get(f"/auth/spotify/callback?code=abc&state={state}", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert resp.headers["location"].endswith("spotify=success")

    user = db.query(User).filter_by(username="pavel").first()
    db.refresh(user.integration)
    assert user.integration.spotify_refresh_token == "rt"


def test_spotify_callback_rejects_forged_state(client):
    _register(client, "quinn")
    client.cookies.clear()
    client.cookies.set("spotify_auth_state", "abc")
    resp = client.get("/auth/spotify/callback?code=x&state=1.abc.forged", follow_redirects=False)
    assert resp.status_code == 400


# --- Cloud polling only picks linked accounts ---

def test_pollable_users_only_include_linked_accounts(client, db):
    _register(client, "rita")
    _register(client, "sam")
    _register(client, "tom")
    rita = db.query(User).filter_by(username="rita").first()
    tom = db.query(User).filter_by(username="tom").first()
    rita.integration.yandex_token = "tok"
    tom.integration.spotify_refresh_token = "rt"
    tom.is_banned = True
    db.commit()

    assert get_pollable_user_ids(db) == [rita.id]


# --- Shared catalog cannot be poisoned by clients ---

def test_client_cannot_rewrite_catalog_metadata(db):
    track = Track(title="Song", artist="Band", duration=200, cover_url=None, track_url=None)
    db.add(track)
    db.commit()

    with patch("app.services.scrobble_processor.get_track_genre", new=AsyncMock(return_value=None)):
        result = asyncio.run(_get_or_create_track(
            db, "Song", "Band", "javascript:alert(1)", "javascript:alert(1)//track/1", 1, ""))

    assert result.id == track.id
    assert result.duration == 200
    assert result.cover_url is None
    assert result.track_url is None


def test_scrobble_counts_only_after_threshold(db, client):
    _register(client, "uma")
    user = db.query(User).filter_by(username="uma").first()
    track = Track(title="T", artist="A", duration=100)
    db.add(track)
    db.commit()
    from datetime import UTC, datetime, timedelta
    now = datetime.now(UTC)
    scrobble = Scrobble(user_id=user.id, track_id=track.id, listened_sec=60,
                        is_playing=True, source="x", played_at=now, updated_at=now)
    db.add(scrobble)
    db.commit()

    assert _update_scrobble_progress(db, user, track, scrobble, now + timedelta(seconds=10), now, True) is False
    later = scrobble.updated_at
    assert _update_scrobble_progress(db, user, track, scrobble, later + timedelta(seconds=20), later, True) is True


# --- Duplicate rows are prevented ---

def test_follow_and_achievement_are_unique(db, client):
    _register(client, "vera")
    _register(client, "will")
    vera = db.query(User).filter_by(username="vera").first()
    will = db.query(User).filter_by(username="will").first()
    from sqlalchemy.exc import IntegrityError

    db.add(Follow(follower_id=vera.id, following_id=will.id))
    db.commit()
    db.add(Follow(follower_id=vera.id, following_id=will.id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    db.add(UserAchievement(user_id=vera.id, achievement_id=1))
    db.commit()
    db.add(UserAchievement(user_id=vera.id, achievement_id=1))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


# --- Text sanitizing / SVG rendering ---

def test_sanitize_text_keeps_plain_text_readable():
    assert sanitize_text("<b>Nice</b> song") == "Nice song"
    assert sanitize_text("It's \"ok\"") == "It's \"ok\""
    assert sanitize_text("Tom &amp; Jerry") == "Tom & Jerry"


def test_svg_truncation_never_splits_entities():
    import xml.dom.minidom
    title = "A" * 30 + "&&&&&&&&&&"
    svg = _render_now_playing_svg("user", title, "Artist & Co", True)
    xml.dom.minidom.parseString(svg)  # must be well-formed XML


# --- Listen Together WebSocket ---

def test_together_ws_rejects_foreign_origin(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/together/room1", headers={"origin": "https://evil.example"}) as ws:
            ws.receive_json()


def test_together_only_host_controls_playback(client):
    # Chat is for signed-in listeners only, so both sides are real accounts
    _register(client, "partyhost")
    host_token = client.cookies.get("api_key")
    client.cookies.clear()
    _register(client, "partyguest")
    guest_token = client.cookies.get("api_key")
    client.cookies.clear()

    with client.websocket_connect(f"/ws/together/party?token={host_token}", headers=ORIGIN) as host_ws:
        host_state = host_ws.receive_json()
        assert host_state["host"] == host_state["you"] == "partyhost"

        with client.websocket_connect(f"/ws/together/party?token={guest_token}", headers=ORIGIN) as guest_ws:
            guest_state = guest_ws.receive_json()
            assert guest_state["you"] != guest_state["host"]
            host_ws.receive_json()  # USER_JOINED

            guest_ws.send_json({"type": "PLAYBACK_CONTROL", "is_playing": True, "progress_sec": 5})
            guest_ws.send_json({"type": "CHAT_MESSAGE", "text": "hi"})
            # The guest's control message is ignored; the next broadcast is the chat
            msg = host_ws.receive_json()
            assert msg["type"] == "CHAT_MESSAGE"

            host_ws.send_json({"type": "PLAYBACK_CONTROL", "is_playing": True, "progress_sec": 5})
            msg = guest_ws.receive_json()
            assert msg["type"] == "CHAT_MESSAGE"
            msg = guest_ws.receive_json()
            assert msg["type"] == "PLAYBACK_CONTROL"
