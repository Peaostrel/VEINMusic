"""A paired extension must authenticate with its key, independently of site cookies."""
import json

import pytest

from app.core.security import create_session_token
from app.models import ApiKey, Scrobble, User, UserIntegration, UserProfile


@pytest.fixture
def paired_extension(client, db):
    user = User(username="extension_owner", hashed_password="fixture",
                profile=UserProfile(preferences=json.dumps({"listening": {"auto_metadata": False}})),
                integration=UserIntegration())
    db.add(user)
    db.commit()
    session = create_session_token(str(user.id), "fixture")
    code = client.post("/api/devices/code", json={"client_name": "Firefox"}).json()
    approved = client.post("/api/devices/approve", headers={"X-API-Key": session},
                           json={"user_code": code["user_code"]})
    assert approved.status_code == 200
    key = client.post("/api/devices/token", json={"device_code": code["device_code"]}).json()["api_key"]
    return user, session, key


def playback(client, key, origin="moz-extension://fixture"):
    headers = {"Authorization": f"Bearer {key}", "Origin": origin}
    return client.post("/api/scrobble", headers=headers,
                       json={"title": "Current", "artist": "Fixture Artist", "source": "yandex",
                             "duration": 180, "progress_sec": 1, "is_playing": True})


@pytest.mark.parametrize("cookie_kind", ["stale", "current"])
def test_paired_key_survives_site_cookie(client, db, paired_extension, cookie_kind):
    user, session, key = paired_extension
    client.cookies.set("api_key", session if cookie_kind == "current" else "expired-site-session")
    response = playback(client, key)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ok"
    assert db.query(Scrobble).one().user_id == user.id


def test_revoked_device_cannot_fall_back_to_valid_site_cookie(client, db, paired_extension):
    _, session, key = paired_extension
    db.query(ApiKey).update({"is_active": False})
    db.commit()
    client.cookies.set("api_key", session)
    assert playback(client, key, "http://localhost:3000").status_code == 401


def test_device_scope_cannot_be_bypassed_with_site_cookie(client, db, paired_extension):
    _, session, key = paired_extension
    db.query(ApiKey).update({"scopes": "profile:read"})
    db.commit()
    client.cookies.set("api_key", session)
    response = playback(client, key, "http://localhost:3000")
    assert response.status_code == 403
    assert response.json()["detail"] == "API ключ не имеет прав для этого действия"


def test_site_cookie_cannot_redirect_playback_to_another_account(client, db, paired_extension):
    user, _, key = paired_extension
    other = User(username="site_account", hashed_password="other", profile=UserProfile(),
                 integration=UserIntegration())
    db.add(other)
    db.commit()
    client.cookies.set("api_key", create_session_token(str(other.id), "other"))
    assert playback(client, key, "http://localhost:3000").status_code == 200
    assert db.query(Scrobble).one().user_id == user.id


def test_connection_check_uses_paired_key_with_stale_site_cookie(client, paired_extension):
    _, _, key = paired_extension
    client.cookies.set("api_key", "expired-site-session")
    assert client.get("/api/profile/preferences", headers={"Authorization": f"Bearer {key}"}).status_code == 200


def test_cookie_only_playback_still_requires_csrf(client, paired_extension):
    _, session, _ = paired_extension
    client.cookies.set("api_key", session)
    response = client.post("/api/scrobble", headers={"Origin": "moz-extension://fixture"},
                           json={"title": "Current", "artist": "Artist", "source": "yandex"})
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]
