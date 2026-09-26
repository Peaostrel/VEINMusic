"""Device pairing, account export/deletion and the incremental Last.fm import."""
import asyncio
import json
import secrets
from unittest.mock import patch

import httpx
from sqlalchemy import text

from app.models import ApiKey, Follow, LastfmImportJob, Scrobble, Track, User

# Generated per run so that no credentials live in the repository
TEST_PASSWORD = secrets.token_urlsafe(16)

ORIGIN = {"Origin": "http://localhost:3000"}


def _register(client, username: str) -> str:
    resp = client.post("/auth/register", json={"username": username, "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    # A session token: full access, unlike the personal key in the response
    # body, which is limited to sending scrobbles and reading.
    return client.cookies.get("api_key")


# --- Device pairing -----------------------------------------------------------

def test_device_pairing_flow_issues_scoped_key(client, db):
    key = _register(client, "pairme")
    client.cookies.clear()

    start = client.post("/api/devices/code", json={"client_name": "Chrome"}).json()
    assert start["verification_uri_complete"].endswith(f"/link?code={start['user_code']}")
    assert client.post("/api/devices/token", json={"device_code": start["device_code"]}).json()["status"] == "pending"

    auth = {"X-API-Key": key}
    info = client.get(f"/api/devices/code/{start['user_code'].lower().replace('-', '')}", headers=auth)
    assert info.status_code == 200 and info.json()["client_name"] == "Chrome"
    assert client.post("/api/devices/approve", json={"user_code": start["user_code"]}, headers=auth).json() == {
        "status": "approved"}

    token = client.post("/api/devices/token", json={"device_code": start["device_code"]}).json()
    assert token["status"] == "approved" and token["username"] == "pairme"
    device_key = token["api_key"]
    # the key can scrobble but can't manage the account
    assert client.post("/api/profile/update", json={"bio": "x"}, headers={"X-API-Key": device_key}).status_code == 403
    assert db.query(ApiKey).filter(ApiKey.name.like("Устройство:%")).count() == 1
    # the device code works only once
    assert client.post("/api/devices/token", json={"device_code": start["device_code"]}).json()["status"] == "invalid"


def test_device_code_can_be_denied(client):
    key = _register(client, "denyme")
    client.cookies.clear()
    start = client.post("/api/devices/code", json={}).json()
    client.post("/api/devices/approve", json={"user_code": start["user_code"], "approve": False},
                headers={"X-API-Key": key})
    assert client.post("/api/devices/token", json={"device_code": start["device_code"]}).json()["status"] == "denied"


# --- Account export / deletion ----------------------------------------------

def test_account_export_contains_data_but_no_secrets(client, db):
    key = _register(client, "exporter")
    user = db.query(User).filter_by(username="exporter").first()
    track = Track(title="Song", artist="Band", duration=100)
    db.add(track)
    db.commit()
    db.add(Scrobble(user_id=user.id, track_id=track.id, listened_sec=100, is_playing=False, source="x"))
    db.commit()
    client.post("/api/integrations/yandex", json={"token": "secret-yandex"}, headers={"X-API-Key": key})

    resp = client.get("/api/account/export", headers={"X-API-Key": key})
    assert resp.status_code == 200
    assert "attachment" in resp.headers["Content-Disposition"]
    data = json.loads(resp.content)
    assert data["account"]["username"] == "exporter"
    assert data["scrobbles"][0]["title"] == "Song"
    assert data["integrations"]["yandex_linked"] is True
    assert "secret-yandex" not in resp.text


def test_account_deletion_requires_password_and_removes_everything(client, db):
    key = _register(client, "leaver")
    other = _register(client, "stayer")
    client.cookies.clear()
    client.post("/api/follow/stayer", json={}, headers={"X-API-Key": key})
    client.post("/api/developer/keys", json={"name": "k", "scopes": "profile:read"}, headers={"X-API-Key": key})
    leaver = db.query(User).filter_by(username="leaver").first()
    track = Track(title="Bye", artist="Band", duration=100)
    db.add(track)
    db.commit()
    db.add(Scrobble(user_id=leaver.id, track_id=track.id, listened_sec=100, is_playing=False, source="x"))
    db.commit()
    leaver_id = leaver.id

    assert client.request("DELETE", "/api/account", json={"password": "wrong-pass"},
                          headers={"X-API-Key": key}).status_code == 400
    resp = client.request("DELETE", "/api/account", json={"password": TEST_PASSWORD}, headers={"X-API-Key": key})
    assert resp.status_code == 200

    db.expire_all()
    assert db.query(User).filter_by(username="leaver").first() is None
    assert db.query(Scrobble).filter_by(user_id=leaver_id).count() == 0
    assert db.query(Follow).filter_by(follower_id=leaver_id).count() == 0
    assert db.query(ApiKey).filter_by(user_id=leaver_id).count() == 0
    assert db.execute(text("SELECT COUNT(*) FROM user_profiles WHERE user_id = :u"), {"u": leaver_id}).scalar() == 0
    assert db.query(User).filter_by(username="stayer").first() is not None
    assert other


# --- Last.fm import ---------------------------------------------------------

def _lastfm_page(page: int, total_pages: int, start_uts: int, count: int = 2) -> dict:
    tracks = [{"name": f"Track {page}-{i}", "artist": {"#text": "Artist"}, "album": {"#text": "Album"},
               "image": [{"#text": ""}], "date": {"uts": str(start_uts - page * 100 - i)}}
              for i in range(count)]
    return {"recenttracks": {"track": tracks,
                             "@attr": {"totalPages": str(total_pages), "total": str(total_pages * count)}}}


class _FakeLastfm:
    def __init__(self, total_pages: int, fail_on_page: int | None = None):
        self.total_pages = total_pages
        self.fail_on_page = fail_on_page
        self.requests: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        self.requests.append(params)
        page = int(params["page"])
        if page == self.fail_on_page:
            return httpx.Response(500)
        return httpx.Response(200, json=_lastfm_page(page, self.total_pages, int(params["to"])))


def _run_import(fake: _FakeLastfm, job_id: int):
    from app.services import lastfm_import
    real_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(fake.handler)
        return real_client(*args, **kwargs)

    async def no_sleep(_):
        return None

    with patch.object(lastfm_import, "LASTFM_API_KEY", "test-key"), \
         patch.object(lastfm_import.httpx, "AsyncClient", client_factory), \
         patch.object(lastfm_import.asyncio, "sleep", no_sleep):
        asyncio.run(lastfm_import.run_import_job(job_id))


def test_lastfm_import_is_paged_resumable_and_incremental(client, db):
    from app.services import lastfm_import

    key = _register(client, "importer")
    client.post("/api/profile/update", json={"lastfm_username": "lfmuser"}, headers={"X-API-Key": key})
    user = db.query(User).filter_by(username="importer").first()
    db.refresh(user.integration)

    # First run fails on page 2 of 3...
    job, needs_enqueue = lastfm_import.prepare_import_job(db, user)
    assert needs_enqueue and job.window_from is None
    fake = _FakeLastfm(total_pages=3, fail_on_page=2)
    _run_import(fake, job.id)
    db.expire_all()
    job = db.get(LastfmImportJob, job.id)
    assert job.status == "failed" and job.current_page == 1
    assert db.query(Scrobble).filter_by(user_id=user.id).count() == 2

    # ...and resumes from page 2 instead of starting over
    job, needs_enqueue = lastfm_import.prepare_import_job(db, user)
    assert needs_enqueue
    fake = _FakeLastfm(total_pages=3)
    _run_import(fake, job.id)
    assert [int(r["page"]) for r in fake.requests] == [2, 3]
    db.expire_all()
    job = db.get(LastfmImportJob, job.id)
    assert job.status == "completed" and job.imported_tracks == 6
    assert db.query(Scrobble).filter_by(user_id=user.id, is_imported=True).count() == 6
    db.refresh(user.integration)
    assert user.integration.has_imported_lastfm is True

    # A later import only asks for what was scrobbled after the last window
    next_job, _ = lastfm_import.prepare_import_job(db, user)
    assert next_job.window_from == job.window_to
    fake = _FakeLastfm(total_pages=1)
    _run_import(fake, next_job.id)
    assert int(fake.requests[0]["from"]) == job.window_to + 1

    status = client.get("/api/import/lastfm/status", headers={"X-API-Key": key}).json()
    assert status["status"] == "completed" and status["incremental"] is True


def test_start_import_endpoint_enqueues_once(client, db):
    from app.services import lastfm_import

    key = _register(client, "starter")
    client.post("/api/profile/update", json={"lastfm_username": "lfmuser2"}, headers={"X-API-Key": key})
    with patch.object(lastfm_import, "LASTFM_API_KEY", "k"), \
         patch("app.routers.integrations.LASTFM_API_KEY", "k"), \
         patch("app.routers.integrations.enqueue_import") as enqueue:
        first = client.post("/api/import/lastfm", json={}, headers={"X-API-Key": key}).json()
        second = client.post("/api/import/lastfm", json={}, headers={"X-API-Key": key}).json()
    assert first["status"] == "import_started"
    assert second["status"] == "already_running"
    assert enqueue.await_count == 1
