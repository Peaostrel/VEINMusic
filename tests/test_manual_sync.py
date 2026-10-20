"""The "sync now" button runs provider calls in the worker, not the API loop."""
import asyncio

import pytest

from app.models import User
from app.services import cloud_scrobbling


@pytest.fixture
def owner(client, db):
    assert client.post("/auth/register", json={"username": "syncer", "password": "syncer-test-password"}).status_code == 200
    client.headers["Origin"] = "http://localhost:3000"
    user = db.query(User).filter_by(username="syncer").one()
    user.integration.spotify_access_token = "access"
    user.integration.spotify_refresh_token = "refresh"
    db.commit()
    return user


class Job:
    def __init__(self, result=None, error=None):
        self.value, self.error = result, error

    async def result(self, timeout=None):
        if self.error:
            raise self.error
        return self.value


class Pool:
    def __init__(self, job):
        self.job, self.calls = job, []

    async def enqueue_job(self, name, *args, **kwargs):
        self.calls.append((name, args, kwargs))
        return self.job


def use_pool(monkeypatch, pool):
    async def get_pool():
        return pool
    monkeypatch.setattr("app.core.redis.get_arq_pool", get_pool)


def test_sync_runs_in_the_worker_and_reports_services(client, owner, monkeypatch):
    pool = Pool(Job(["spotify"]))
    use_pool(monkeypatch, pool)
    response = client.post("/api/integrations/sync", json={"service": "all"})
    assert response.status_code == 200, response.text
    assert response.json()["services"] == ["spotify"]
    assert pool.calls == [("sync_cloud_user", (owner.id, ["spotify"]), {"_job_id": f"manual_sync:{owner.id}"})]


def test_slow_sync_continues_in_background(client, owner, monkeypatch):
    use_pool(monkeypatch, Pool(Job(error=asyncio.TimeoutError())))
    response = client.post("/api/integrations/sync", json={"service": "spotify"})
    assert response.status_code == 202
    assert response.json() == {"status": "queued", "services": ["spotify"]}


def test_repeat_click_and_unlinked_service_are_refused(client, owner, monkeypatch):
    use_pool(monkeypatch, Pool(None))
    assert client.post("/api/integrations/sync", json={"service": "spotify"}).status_code == 409
    assert client.post("/api/integrations/sync", json={"service": "yandex"}).json()["detail"].startswith("Нет активных")


def test_worker_job_syncs_linked_services(db, owner, monkeypatch):
    synced = []

    async def fake_sync(user, session, record):
        synced.append(user.id)
    monkeypatch.setattr(cloud_scrobbling, "sync_spotify_status", fake_sync)
    monkeypatch.setattr(cloud_scrobbling, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)
    result = asyncio.run(cloud_scrobbling.sync_user_now(owner.id, ["spotify", "yandex"], None))
    assert result == ["spotify"] and synced == [owner.id]
    db.refresh(owner.integration)
    assert owner.integration.last_sync is not None
