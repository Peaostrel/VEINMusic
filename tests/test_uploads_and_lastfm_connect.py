import asyncio
import os
import time
import urllib.parse
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.database import SessionLocal
from app.models import AvatarFrame, ExternalSyncConfig, SystemAnnouncement, User, UserProfile
from app.routers import lastfm_connect
from app.services.uploads_cleanup import MIN_AGE_SEC, cleanup_orphan_uploads, referenced_uploads

NAME_A = "a" * 32 + ".jpg"
NAME_B = "b" * 32 + ".png"
NAME_C = "c" * 32 + ".webp"
NAME_D = "d" * 32 + ".gif"


# --- uploads cleanup ---------------------------------------------------------

def _touch(directory, name, age_sec):
    path = directory / name
    path.write_bytes(b"x")
    mtime = time.time() - age_sec
    os.utime(path, (mtime, mtime))
    return path


def _user_with_avatar(db, avatar_url):
    user = User(username="uploader", hashed_password="x")
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id, avatar_url=avatar_url))
    db.commit()


def test_referenced_uploads_scans_all_columns(db):
    _user_with_avatar(db, f"https://api.example/uploads/{NAME_A}")
    db.add(AvatarFrame(name="frame", code="frame", image_url=f"/uploads/{NAME_B}"))
    db.add(SystemAnnouncement(title="t", message=f"see ![](/uploads/{NAME_C}) and /uploads/not-an-upload.jpg"))
    db.commit()
    assert referenced_uploads(db) == {NAME_A, NAME_B, NAME_C}


def test_cleanup_removes_only_old_unreferenced_uploads(db, tmp_path):
    _user_with_avatar(db, f"/uploads/{NAME_A}")
    old = MIN_AGE_SEC + 60
    referenced = _touch(tmp_path, NAME_A, old)
    orphan = _touch(tmp_path, NAME_B, old)
    fresh = _touch(tmp_path, NAME_C, 60)
    foreign = _touch(tmp_path, "keep-me.txt", old)
    upper = _touch(tmp_path, NAME_D.upper(), old)

    assert cleanup_orphan_uploads(db, str(tmp_path)) == 1
    assert referenced.exists()
    assert not orphan.exists()
    assert fresh.exists()
    assert foreign.exists()
    assert upper.exists()

    # A fresh orphan goes once it is old enough
    assert cleanup_orphan_uploads(db, str(tmp_path), now=time.time() + MIN_AGE_SEC) == 1
    assert not fresh.exists()


def test_cleanup_handles_missing_dir_and_remove_errors(db, tmp_path):
    assert cleanup_orphan_uploads(db, str(tmp_path / "missing")) == 0
    _touch(tmp_path, NAME_B, MIN_AGE_SEC + 60)
    with patch("app.services.uploads_cleanup.os.remove", side_effect=OSError("busy")):
        assert cleanup_orphan_uploads(db, str(tmp_path)) == 0


# --- Last.fm connect ---------------------------------------------------------

@pytest.fixture
def lastfm_configured():
    with patch.object(lastfm_connect, "LASTFM_API_KEY", "key123"), \
            patch.object(lastfm_connect, "LASTFM_SHARED_SIGNING_SALT", "salt456"):
        yield


@pytest.fixture
def signed_in(client):
    client.headers["Origin"] = "http://localhost:3000"
    client.post("/auth/register", json={"username": "fmuser", "password": "password"})
    return client


def _connect(client):
    res = client.get("/api/integrations/lastfm/connect", follow_redirects=False)
    assert res.status_code == 307
    location = urllib.parse.urlparse(res.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == lastfm_connect.LASTFM_AUTH_URL
    query = urllib.parse.parse_qs(location.query)
    assert query["api_key"] == ["key123"]
    callback = urllib.parse.urlparse(query["cb"][0])
    assert callback.path == "/api/integrations/lastfm/callback"
    state = urllib.parse.parse_qs(callback.query)["state"][0]
    assert client.cookies.get(lastfm_connect.STATE_COOKIE)
    return state


def test_connect_requires_configuration(signed_in):
    with patch.object(lastfm_connect, "LASTFM_API_KEY", ""):
        assert signed_in.get("/api/integrations/lastfm/connect", follow_redirects=False).status_code == 503


def test_connect_requires_auth(client, lastfm_configured):
    assert client.get("/api/integrations/lastfm/connect", follow_redirects=False).status_code == 401


def test_callback_saves_session_key(signed_in, lastfm_configured):
    state = _connect(signed_in)
    with patch.object(lastfm_connect, "_get_session_key", new=AsyncMock(return_value="sk-1")):
        res = signed_in.get("/api/integrations/lastfm/callback",
                            params={"state": state, "token": "tok"}, follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"].endswith("/settings?tab=export&status=lastfm_connected")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "fmuser").one()
        config = db.query(ExternalSyncConfig).filter_by(user_id=user.id).one()
        assert config.lastfm_session_key == "sk-1"
        assert config.is_lastfm_enabled is True
    finally:
        db.close()


def test_callback_reports_failed_exchange(signed_in, lastfm_configured):
    state = _connect(signed_in)
    with patch.object(lastfm_connect, "_get_session_key", new=AsyncMock(return_value=None)):
        res = signed_in.get("/api/integrations/lastfm/callback",
                            params={"state": state, "token": "tok"}, follow_redirects=False)
    assert res.headers["location"].endswith("status=lastfm_error")


def test_callback_rejects_bad_state(signed_in, lastfm_configured):
    state = _connect(signed_in)
    user_id, nonce, signature = state.split(".")
    forged = [
        f"{int(user_id) + 1}.{nonce}.{signature}",  # another user
        f"{user_id}.{nonce}.{'0' * 64}",  # bad signature
        "garbage",
    ]
    for bad in forged:
        res = signed_in.get("/api/integrations/lastfm/callback",
                            params={"state": bad, "token": "tok"}, follow_redirects=False)
        assert res.status_code == 400, bad

    # A valid state from another browser (no nonce cookie) is refused too
    signed_in.cookies.delete(lastfm_connect.STATE_COOKIE)
    res = signed_in.get("/api/integrations/lastfm/callback",
                        params={"state": state, "token": "tok"}, follow_redirects=False)
    assert res.status_code == 400


def test_callback_rejects_banned_user(signed_in, lastfm_configured):
    state = _connect(signed_in)
    db = SessionLocal()
    try:
        db.query(User).filter(User.username == "fmuser").update({"is_banned": True})
        db.commit()
    finally:
        db.close()
    res = signed_in.get("/api/integrations/lastfm/callback",
                        params={"state": state, "token": "tok"}, follow_redirects=False)
    assert res.status_code == 400


def _mock_lastfm(handler):
    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)
    return patch.object(lastfm_connect.httpx, "AsyncClient", side_effect=factory)


def test_get_session_key_signs_request(lastfm_configured):
    seen = {}

    def handler(request):
        seen.update(dict(request.url.params))
        return httpx.Response(200, json={"session": {"key": "abc", "name": "fm"}})

    with _mock_lastfm(handler):
        assert asyncio.run(lastfm_connect._get_session_key("tok")) == "abc"
    assert seen["method"] == "auth.getSession"
    assert seen["token"] == "tok"
    assert len(seen["api_sig"]) == 32


@pytest.mark.parametrize("response", [
    httpx.Response(200, json={"error": 4, "message": "Invalid token"}),
    httpx.Response(200, text="not json"),
    httpx.Response(200, json=["unexpected"]),
])
def test_get_session_key_handles_errors(lastfm_configured, response):
    with _mock_lastfm(lambda request: response):
        assert asyncio.run(lastfm_connect._get_session_key("tok")) is None


def test_get_session_key_handles_network_error(lastfm_configured):
    def handler(request):
        raise httpx.ConnectError("down")

    with _mock_lastfm(handler):
        assert asyncio.run(lastfm_connect._get_session_key("tok")) is None


# --- worker jobs -------------------------------------------------------------

def test_worker_cleanup_job_uses_uploads_dir(tmp_path):
    from app import worker
    _touch(tmp_path, NAME_B, MIN_AGE_SEC + 60)
    with patch("app.routers.media.UPLOADS_DIR", str(tmp_path)):
        asyncio.run(worker.cleanup_uploads({}))
    assert not (tmp_path / NAME_B).exists()

    with patch.object(worker, "_cleanup_uploads_sync", side_effect=RuntimeError("db down")):
        asyncio.run(worker.cleanup_uploads({}))  # logged, not raised


def test_worker_and_fallback_social_push_jobs():
    from app import worker
    from app.core import redis as redis_module
    with patch("app.services.notifications.send_social_push", new=AsyncMock()) as deliver:
        asyncio.run(worker.send_social_push({}, 5))
        deliver.assert_awaited_once_with(5)
    with patch("app.services.notifications.send_social_push", new=AsyncMock(side_effect=RuntimeError("x"))):
        asyncio.run(redis_module._run_social_push_job(5))  # logged, not raised
    assert "send_social_push" in {f.__name__ for f in worker.WorkerSettings.functions}
