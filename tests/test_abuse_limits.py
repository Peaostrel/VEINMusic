"""Limits against abuse: webhook/push amplification, input bounds, key scopes,
privacy of follow relations, forged share cards, social links, guest chat."""
import asyncio
import json
import secrets
from unittest.mock import AsyncMock, patch

import pytest

from app.models import Achievement, PushSubscription, Scrobble, Track, User, UserAchievement
from app.routers.developer import MAX_ACTIVE_API_KEYS
from app.routers.platform import MAX_PUSH_SUBSCRIPTIONS_PER_USER
from app.services.webhooks import MAX_WEBHOOKS_PER_USER

# Generated per run so that no credentials live in the repository
TEST_PASSWORD = secrets.token_urlsafe(16)

ORIGIN = {"Origin": "http://localhost:3000"}


def _register(client, username: str) -> tuple[str, str]:
    """Returns (session token, personal API key)."""
    resp = client.post("/auth/register", json={"username": username, "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    return client.cookies.get("api_key"), resp.json()["api_key"]


# --- Webhooks ----------------------------------------------------------------

def test_webhooks_per_user_are_capped(client):
    session, _ = _register(client, "hookcap")
    client.cookies.clear()
    headers = {"X-API-Key": session}
    with patch("app.utils.is_safe_url", return_value=True):
        for i in range(MAX_WEBHOOKS_PER_USER):
            resp = client.post("/api/developer/webhooks", headers=headers,
                               json={"url": f"https://example.com/h{i}", "events": "scrobble.created"})
            assert resp.status_code == 200, resp.text
        resp = client.post("/api/developer/webhooks", headers=headers,
                           json={"url": "https://example.com/extra", "events": "scrobble.created"})
    assert resp.status_code == 400


def test_webhook_test_pings_only_the_selected_webhook(client):
    session, _ = _register(client, "hookping")
    client.cookies.clear()
    headers = {"X-API-Key": session}
    ids = []
    with patch("app.utils.is_safe_url", return_value=True):
        for i in range(3):
            # no events filter: before the fix a test ping reached all of them
            resp = client.post("/api/developer/webhooks", headers=headers,
                               json={"url": f"https://example.com/p{i}", "events": ""})
            ids.append(resp.json()["id"])

    sent = AsyncMock()
    with patch("app.services.webhooks.pinned_request", sent):
        assert client.post(f"/api/developer/webhooks/{ids[1]}/test", headers=headers).status_code == 200
    assert sent.await_count == 1
    assert sent.await_args.args[1] == "https://example.com/p1"


def test_api_keys_per_user_are_capped(client):
    session, _ = _register(client, "keycap")
    client.cookies.clear()
    headers = {"X-API-Key": session}
    for i in range(MAX_ACTIVE_API_KEYS):
        resp = client.post("/api/developer/keys", headers=headers, json={"name": f"k{i}", "scopes": "profile:read"})
        assert resp.status_code == 200, resp.text
    resp = client.post("/api/developer/keys", headers=headers, json={"name": "extra", "scopes": "profile:read"})
    assert resp.status_code == 400


# --- Push --------------------------------------------------------------------

@pytest.fixture
def push_enabled(monkeypatch, request):
    from app.services import push_notifications
    for name, value in push_notifications.generate_vapid_keys().items():
        monkeypatch.setenv(name, value)
    push_notifications._vapid_private_key.cache_clear()
    request.addfinalizer(push_notifications._vapid_private_key.cache_clear)
    monkeypatch.setattr("app.utils.is_safe_url", lambda url, allowed_domains=None: True)


def test_push_subscriptions_keep_only_the_newest(client, db, push_enabled):
    session, _ = _register(client, "pushcap")
    client.cookies.clear()
    headers = {"X-API-Key": session}
    total = MAX_PUSH_SUBSCRIPTIONS_PER_USER + 3
    for i in range(total):
        resp = client.post("/api/push/subscribe", headers=headers, json={
            "endpoint": f"https://push.example.com/sub/{i}", "p256dh": "k", "auth": "a"})
        assert resp.status_code == 200, resp.text

    user = db.query(User).filter_by(username="pushcap").first()
    endpoints = {s.endpoint for s in db.query(PushSubscription).filter_by(user_id=user.id)}
    assert len(endpoints) == MAX_PUSH_SUBSCRIPTIONS_PER_USER
    assert f"https://push.example.com/sub/{total - 1}" in endpoints
    assert "https://push.example.com/sub/0" not in endpoints


# --- Scrobble input bounds ---------------------------------------------------

def test_overlong_scrobble_fields_are_truncated(client, db):
    session, _ = _register(client, "longtitle")
    client.cookies.clear()
    resp = client.post("/api/scrobble", headers={"X-API-Key": session}, json={
        "title": "T" * 5000, "artist": "A" * 5000, "album": "B" * 5000,
        "source": "s" * 500, "duration": 200, "progress_sec": 1,
    })
    assert resp.status_code == 200, resp.text

    user = db.query(User).filter_by(username="longtitle").first()
    scrobble = db.query(Scrobble).filter_by(user_id=user.id).first()
    track = db.query(Track).filter_by(id=scrobble.track_id).first()
    assert len(track.title) <= 300 and len(track.artist) <= 300
    assert len(scrobble.source) <= 32


def test_out_of_range_playback_values_are_clamped():
    from app.schemas import ScrobbleData
    data = ScrobbleData(title="t", artist="a", source="yandex", progress_sec=-5, duration=10**9)
    assert data.progress_sec == 0
    assert data.duration == 86400


# --- Personal API key scope --------------------------------------------------

def test_personal_key_can_scrobble_but_not_change_the_account(client):
    _, personal_key = _register(client, "scoped")
    client.cookies.clear()
    headers = {"X-API-Key": personal_key}

    assert client.post("/api/scrobble", headers=headers, json={
        "title": "Song", "artist": "Band", "source": "desktop", "duration": 200}).status_code == 200
    assert client.get("/api/user/scoped", headers=headers).status_code == 200

    assert client.post("/api/profile/update", headers=headers, json={"bio": "pwned"}).status_code == 403
    assert client.post("/api/developer/keys", headers=headers,
                       json={"name": "x", "scopes": "*"}).status_code == 403
    assert client.post("/api/profile/apikey/generate", headers=headers).status_code == 403


# --- Privacy / forgery -------------------------------------------------------

def test_follow_stats_does_not_reveal_other_peoples_follows(client):
    fan_session, _ = _register(client, "secretfan")
    client.cookies.clear()
    _register(client, "celebrity")
    client.cookies.clear()
    assert client.post("/api/follow/celebrity", json={},
                       headers={"X-API-Key": fan_session}).status_code == 200

    # an anonymous visitor asking "does secretfan follow celebrity?"
    body = client.get("/api/follow-stats/secretfan/celebrity").json()
    assert body["is_following"] is False
    assert body["followers"] == 1

    # the fan themself still gets the real answer
    body = client.get("/api/follow-stats/secretfan/celebrity", headers={"X-API-Key": fan_session}).json()
    assert body["is_following"] is True


def test_og_achievement_card_requires_the_achievement(client, db):
    _register(client, "noach")
    client.cookies.clear()
    ach = Achievement(name="Secret Trophy", description="d", icon="🏆", reward_xp=10)
    db.add(ach)
    db.commit()

    card = client.get(f"/api/widgets/og/achievement/noach/{ach.id}.svg").text
    assert "Secret Trophy" not in card

    user = db.query(User).filter_by(username="noach").first()
    db.add(UserAchievement(user_id=user.id, achievement_id=ach.id))
    db.commit()
    card = client.get(f"/api/widgets/og/achievement/noach/{ach.id}.svg").text
    assert "Secret Trophy" in card


# --- Social links ------------------------------------------------------------

def test_social_links_are_restricted_to_known_networks(client, db):
    _register(client, "socials")
    ok = json.dumps([{"id": 1, "network": "GitHub", "username": "@octocat"}])
    assert client.post("/api/profile/update", headers=ORIGIN, json={"social_links": ok}).status_code == 200
    user = db.query(User).filter_by(username="socials").first()
    db.refresh(user.profile)
    assert json.loads(user.profile.social_links) == [{"id": 1, "network": "github", "username": "octocat"}]

    for bad in (
        [{"id": 1, "network": "evil.example/phish?", "username": "x"}],
        [{"id": 1, "network": "github", "username": "a/../../phish"}],
    ):
        resp = client.post("/api/profile/update", headers=ORIGIN, json={"social_links": json.dumps(bad)})
        assert resp.status_code == 400


# --- Listen Together ---------------------------------------------------------

def test_guests_cannot_chat_in_rooms():
    from app import main

    with patch.object(main.manager, "add_room_chat", AsyncMock()) as add_chat, \
            patch.object(main.manager, "broadcast_to_room", AsyncMock()) as broadcast:
        asyncio.run(main._handle_room_message(
            "room", "Guest_abc123", {"type": "CHAT_MESSAGE", "text": "spam"},
            {"last_chat": 0.0, "is_guest": True}))
        add_chat.assert_not_awaited()
        broadcast.assert_not_awaited()

        asyncio.run(main._handle_room_message(
            "room", "member", {"type": "CHAT_MESSAGE", "text": "hi"},
            {"last_chat": 0.0, "is_guest": False}))
        add_chat.assert_awaited_once()
