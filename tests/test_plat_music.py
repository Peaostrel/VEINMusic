"""Partner sends authenticated playback to the shared scrobble API."""
import json
import secrets
from datetime import UTC, datetime, timedelta

import pytest

from app.core.security import create_session_token, hash_developer_key
from app.models import ApiKey, Scrobble, SourceHealth, User, UserIntegration, UserProfile


@pytest.fixture
def plat_account(db):
    user = User(username="plat_listener", hashed_password="fixture-hash",
                profile=UserProfile(preferences=json.dumps({"listening": {"auto_metadata": False}})),
                integration=UserIntegration())
    db.add(user)
    db.flush()
    token = "vm_" + secrets.token_urlsafe(32)
    key = ApiKey(user_id=user.id, key_hash=hash_developer_key(token), prefix=token[:9],
                 name="Устройство: Plat Music", scopes="scrobble:write,profile:read", is_active=True)
    db.add(key)
    db.commit()
    owner = {"X-API-Key": create_session_token(str(user.id), str(user.hashed_password))}
    return user, key, token, owner


def payload(source="plat_music", progress=0, playing=True):
    return {"title": "Partner Track", "artist": "Partner Artist", "album": "Partner Album",
            "source": source, "duration": 180, "progress_sec": progress, "is_playing": playing,
            "track_url": "https://plat-music.ru/track/42", "cover_url": "https://plat-music.ru/cover/42.jpg"}


@pytest.mark.parametrize("source", ["plat", "plat_music", "plat-music", "Plat Music", "platmusic"])
@pytest.mark.parametrize("auth", ["header", "bearer", "body"])
def test_partner_receives_track_and_diagnostics(client, db, plat_account, source, auth):
    user, _, token, owner = plat_account
    data = payload(source)
    headers = {}
    if auth == "body":
        data["api_key"] = token
    else:
        headers = {"X-API-Key": token} if auth == "header" else {"Authorization": f"Bearer {token}"}
    response = client.post("/api/scrobble", json=data, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ok"
    row = db.query(Scrobble).one()
    assert row.user_id == user.id
    assert row.source == "plat"
    assert row.track.title == data["title"]
    assert row.track.track_url == data["track_url"]
    assert db.query(SourceHealth).one().source == "plat"
    check = client.get("/api/me/connection-check?source=plat", headers=owner).json()
    assert check["received"] is True
    assert check["counted"] is False
    assert client.get("/api/me/connection-check?source=extension", headers=owner).json()["received"] is False
    services = client.get("/api/integrations/status", headers=owner).json()["services"]
    service = next(item for item in services if item["id"] == "plat")
    assert service["mode"] == "partner"
    assert service["linked"] is True
    assert service["last_event_at"] is not None


def test_progress_pause_and_repeated_reports_do_not_duplicate_play(client, db, plat_account):
    _, _, token, _ = plat_account
    auth = {"X-API-Key": token}
    assert client.post("/api/scrobble", json=payload(), headers=auth).json()["status"] == "ok"
    row = db.query(Scrobble).one()
    row.updated_at = datetime.now(UTC) - timedelta(seconds=15)
    db.commit()
    assert client.post("/api/scrobble", json=payload("Plat Music", 15), headers=auth).json()["status"] == "ok"
    db.expire_all()
    row = db.query(Scrobble).one()
    assert 15 <= row.listened_sec <= 16
    before_pause = row.listened_sec
    row.updated_at = datetime.now(UTC) - timedelta(seconds=15)
    db.commit()
    assert client.post("/api/scrobble", json=payload(progress=30, playing=False), headers=auth).json()["status"] == "ok"
    db.expire_all()
    row = db.query(Scrobble).one()
    assert row.is_playing is False
    assert row.listened_sec == before_pause
    client.post("/api/scrobble", json=payload(progress=30, playing=False), headers=auth)
    db.expire_all()
    assert db.query(Scrobble).count() == 1
    assert db.query(Scrobble).one().listened_sec == before_pause


@pytest.mark.parametrize("section,settings,status", [
    ("integrations", {"plat_enabled": False}, "integration_paused"),
    ("integrations", {"auto_sync": False}, "integration_paused"),
    ("listening", {"ignored_sources": ["plat"]}, "source_ignored"),
])
def test_partner_respects_preferences(client, db, plat_account, section, settings, status):
    user, _, token, owner = plat_account
    response = client.put("/api/profile/preferences", json={section: settings}, headers=owner)
    assert response.status_code == 200, response.text
    assert client.post("/api/scrobble", json=payload(), headers={"X-API-Key": token}).json()["status"] == status
    assert db.query(Scrobble).filter_by(user_id=user.id).count() == 0


@pytest.mark.parametrize("auth_style", ["header", "body"])
def test_revoked_or_read_only_key_cannot_write(client, db, plat_account, auth_style):
    _, key, token, _ = plat_account
    auth = {"X-API-Key": token} if auth_style == "header" else {}
    data = payload()
    if auth_style == "body":
        data["api_key"] = token
    key.scopes = "profile:read"
    db.commit()
    assert client.post("/api/scrobble", json=data, headers=auth).status_code == 403
    key.is_active = False
    db.commit()
    assert client.post("/api/scrobble", json=data, headers=auth).status_code == 401
    assert db.query(Scrobble).count() == 0


def test_header_credentials_keep_precedence_over_body(client, db, plat_account):
    _, _, token, _ = plat_account
    data = payload()
    data["api_key"] = token
    response = client.post("/api/scrobble", json=data, headers={"X-API-Key": "invalid"})
    assert response.status_code == 401
    assert db.query(Scrobble).count() == 0


def test_live_partner_play_counts_after_threshold(client, db, plat_account):
    _, _, token, owner = plat_account
    auth = {"X-API-Key": token}
    client.post("/api/scrobble", json=payload(), headers=auth)
    for progress in range(21, 169, 21):
        row = db.query(Scrobble).one()
        row.updated_at = datetime.now(UTC) - timedelta(seconds=21)
        db.commit()
        assert client.post("/api/scrobble", json=payload(progress=progress), headers=auth).json()["status"] == "ok"
        db.expire_all()
    row = db.query(Scrobble).one()
    assert row.listened_sec >= 153
    assert row.xp_earned > 0
    assert client.get("/api/me/connection-check?source=plat", headers=owner).json()["counted"] is True
