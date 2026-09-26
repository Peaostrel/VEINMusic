"""XP multiplier and feature flags set from the admin panel."""
import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from starlette.websockets import WebSocketDisconnect

from app.core.security import create_session_token
from app.database import SessionLocal
from app.models import FeatureFlag, Scrobble, SystemSetting, Track, User, Webhook
from app.services import runtime_settings, scrobble_processor, webhooks

ORIGIN = {"Origin": "http://localhost:3000"}


@pytest.fixture
def admin_client(client, db):
    client.headers.update(ORIGIN)
    client.post("/auth/register", json={"username": "boss", "password": "password"})
    boss = db.query(User).filter(User.username == "boss").first()
    boss.role = "admin"
    db.commit()
    client.cookies.set("api_key", create_session_token(str(boss.id), str(boss.hashed_password)))
    return client


def _set_flag(key, enabled):
    s = SessionLocal()
    try:
        flag = s.query(FeatureFlag).filter_by(key=key).first()
        if flag is None:
            flag = FeatureFlag(key=key)
            s.add(flag)
        flag.is_enabled = enabled
        s.commit()
    finally:
        s.close()
    runtime_settings.invalidate()


# --- XP multiplier -----------------------------------------------------------

def test_multiplier_is_persisted_and_shared(admin_client):
    assert admin_client.post("/api/admin/economy/multiplier", json={"multiplier": 3}).status_code == 200
    s = SessionLocal()
    try:
        assert s.get(SystemSetting, "xp_multiplier").value == "3.0"
    finally:
        s.close()
    # Another process (empty cache) reads the same value from the database
    runtime_settings.invalidate()
    assert runtime_settings.get_xp_multiplier() == 3.0


def test_invalid_stored_multiplier_falls_back_to_default(db):
    db.add(SystemSetting(key="xp_multiplier", value="lots"))
    db.commit()
    assert runtime_settings.get_xp_multiplier(db) == 1.0


@pytest.mark.parametrize("multiplier,base,expected", [
    (1.0, 1, 1), (2.0, 1, 2), (2.0, 2, 4), (1.5, 1, 2), (0.5, 1, 1), (0.1, 2, 1),
])
def test_apply_multiplier(db, multiplier, base, expected):
    runtime_settings.set_xp_multiplier(db, multiplier)
    assert runtime_settings.apply_xp_multiplier(base, db) == expected


def test_counted_play_earns_multiplied_xp(client, db):
    client.post("/auth/register", json={"username": "listener", "password": "password"})
    runtime_settings.set_xp_multiplier(db, 3)
    user = db.query(User).filter(User.username == "listener").one()
    track = Track(title="Song", artist="Band", duration=100)
    db.add(track)
    db.flush()
    started = datetime.now(UTC) - timedelta(seconds=20)
    scrobble = Scrobble(user_id=user.id, track_id=track.id, source="yandex", is_playing=True,
                        listened_sec=80, played_at=started, updated_at=started)
    db.add(scrobble)
    db.commit()

    counted = scrobble_processor._update_scrobble_progress(
        db, user, track, scrobble, datetime.now(UTC), started, True)
    assert counted is True
    assert scrobble.xp_earned == 3


# --- feature flags -----------------------------------------------------------

def test_public_flags_report_known_features_as_on(client):
    flags = client.get("/api/feature-flags").json()["flags"]
    assert set(runtime_settings.KNOWN_FEATURES) <= set(flags)
    assert all(flags[k] for k in runtime_settings.KNOWN_FEATURES)


def test_registration_can_be_closed(client):
    _set_flag("registration", False)
    res = client.post("/auth/register", json={"username": "latecomer", "password": "password"})
    assert res.status_code == 403
    assert client.get("/api/feature-flags").json()["flags"]["registration"] is False


def test_listen_together_can_be_switched_off(client):
    _set_flag("listen_together", False)
    assert client.get("/api/together/rooms").status_code == 503
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/ws/together/room1", headers=ORIGIN) as ws:
            ws.receive_json()
    assert closed.value.code == 4010


def test_lastfm_import_can_be_switched_off(client):
    client.headers.update(ORIGIN)
    client.post("/auth/register", json={"username": "importer", "password": "password"})
    _set_flag("lastfm_import", False)
    assert client.post("/api/import/lastfm", json={}).status_code == 503


def test_webhooks_can_be_switched_off(client, db):
    client.headers.update(ORIGIN)
    client.post("/auth/register", json={"username": "hooker", "password": "password"})
    user = db.query(User).filter(User.username == "hooker").one()
    db.add(Webhook(user_id=user.id, url="https://example.com/h", secret="s", events="", is_active=True))
    db.commit()
    hook_id = db.query(Webhook.id).scalar()
    _set_flag("webhooks", False)

    assert client.post("/api/developer/webhooks", json={"url": "https://example.com/x"}).status_code == 503
    assert client.post(f"/api/developer/webhooks/{hook_id}/test").status_code == 503
    with patch.object(webhooks, "_deliver", new=AsyncMock()) as deliver:
        asyncio.run(webhooks.dispatch_webhook_event("scrobble.created", {}, int(user.id), db))
        deliver.assert_not_awaited()


def test_admin_toggle_takes_effect_immediately(admin_client):
    assert admin_client.get("/api/together/rooms").status_code == 200  # value now cached
    res = admin_client.put("/api/admin/feature-flags/listen_together", json={"is_enabled": False})
    assert res.status_code == 404  # not seeded in tests: create it instead
    admin_client.post("/api/admin/feature-flags", json={"key": "listen_together", "is_enabled": False})
    assert admin_client.get("/api/together/rooms").status_code == 503
    admin_client.put("/api/admin/feature-flags/listen_together", json={"is_enabled": True})
    assert admin_client.get("/api/together/rooms").status_code == 200
    admin_client.delete("/api/admin/feature-flags/listen_together")
    assert admin_client.get("/api/together/rooms").status_code == 200

    listing = admin_client.get("/api/admin/feature-flags").json()
    assert "registration" in listing["known_features"]


def test_cached_values_expire(db, monkeypatch):
    assert runtime_settings.is_feature_enabled("webhooks", db) is True
    db.add(FeatureFlag(key="webhooks", is_enabled=False))
    db.commit()
    assert runtime_settings.is_feature_enabled("webhooks", db) is True  # still cached
    monkeypatch.setattr(runtime_settings, "CACHE_TTL_SEC", 0.0)
    assert runtime_settings.is_feature_enabled("webhooks", db) is False
