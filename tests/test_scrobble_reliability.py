"""Playback intake must survive ordinary skips and slow optional services."""
import asyncio
import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.core.security import create_session_token
from app.models import Scrobble, SourceHealth, Track, User, UserIntegration, UserProfile
from app.services import cloud_scrobbling as cloud


@pytest.fixture
def listener(db):
    user = User(username="reliable_listener", hashed_password="fixture",
                profile=UserProfile(preferences=json.dumps({"listening": {"auto_metadata": False}})),
                integration=UserIntegration())
    db.add(user)
    db.commit()
    return user, {"X-API-Key": create_session_token(str(user.id), "fixture")}


def report(title="Current", source="yandex"):
    return {"title": title, "artist": "Fixture Artist", "source": source,
            "duration": 180, "progress_sec": 0, "is_playing": True}


@pytest.mark.parametrize("source", ["plat", "yandex", "spotify", "youtube_music", "soundcloud", "apple_music"])
def test_many_skipped_tracks_do_not_disable_any_provider(client, db, listener, source):
    user, headers = listener
    track = Track(title="Earlier", artist="Fixture Artist", duration=180)
    db.add(track)
    db.flush()
    before = datetime.now(UTC) - timedelta(minutes=2)
    db.add_all([Scrobble(user_id=user.id, track_id=track.id, source=source,
                        played_at=before, updated_at=before, listened_sec=20,
                        is_playing=False) for _ in range(45)])
    db.commit()
    assert client.post("/api/scrobble", headers=headers, json=report(source=source)).json()["status"] == "ok"
    # A switch immediately after a heartbeat is also valid for every source.
    assert client.post("/api/scrobble", headers=headers, json=report("Next", source)).json()["status"] == "ok"
    current = client.get(f"/api/current-track/{user.username}", headers=headers).json()
    assert current["playing"] is True
    assert current["title"] == "Next"
    row = db.query(Scrobble).order_by(Scrobble.id.desc()).first()
    assert row.listened_sec == 0
    assert row.xp_earned == 0


def test_endpoint_throttling_is_reported_in_connection_diagnostics(client, db, listener):
    _, headers = listener
    client.post("/api/scrobble", headers=headers, json=report())
    response = client.post("/api/scrobble", headers=headers, json=report())
    assert response.json()["status"] == "rate_limited"
    health = db.query(SourceHealth).one()
    assert health.status == "rate_limited"
    assert health.received_count == 2


@pytest.mark.parametrize("source", ["yandex", "spotify", "youtube_music", "soundcloud"])
def test_metadata_lookup_does_not_block_non_plat_playback(client, db, listener, source):
    user, headers = listener
    user.profile.preferences = json.dumps({"listening": {"auto_metadata": True}})
    db.commit()
    with patch("app.services.scrobble_processor._enrich_track_metadata", new_callable=AsyncMock) as lookup, \
            patch("app.core.redis.enqueue_background_task", new_callable=AsyncMock) as queue:
        response = client.post("/api/scrobble", headers=headers, json=report(source=source))
    assert response.json()["status"] == "ok"
    lookup.assert_not_awaited()
    assert any(call.args[0] == "enrich_track_metadata" for call in queue.await_args_list)


def test_cloud_scheduler_enqueues_every_account_without_waiting_for_provider():
    enqueue, poll = AsyncMock(), AsyncMock()
    with patch("app.core.redis.get_redis_client", side_effect=RuntimeError("offline")), \
            patch.object(cloud, "_load_pollable_user_ids", return_value=list(range(1, 31))), \
            patch.object(cloud, "poll_user", poll):
        asyncio.run(cloud.poll_once(AsyncMock(), enqueue_user=enqueue))
    assert [call.args[0] for call in enqueue.await_args_list] == list(range(1, 31))
    poll.assert_not_awaited()


def test_cloud_worker_uses_stable_account_job_ids():
    from app.worker import cloud_poll
    redis = AsyncMock()

    async def schedule(_process, *, enqueue_user):
        await enqueue_user(17)
        await enqueue_user(23)

    with patch.object(cloud, "poll_once", side_effect=schedule):
        asyncio.run(cloud_poll({"redis": redis}))
    assert [call.args for call in redis.enqueue_job.await_args_list] == [
        ("poll_cloud_user", 17), ("poll_cloud_user", 23)]
    assert [call.kwargs["_job_id"] for call in redis.enqueue_job.await_args_list] == [
        "cloud_poll_user:17", "cloud_poll_user:23"]


def test_spotify_without_artwork_and_with_explicit_pause_is_recorded():
    from types import SimpleNamespace
    user = SimpleNamespace(id=1, username="fixture", integration=SimpleNamespace(spotify_access_token="fixture"))
    process = AsyncMock()
    payload = {"is_playing": False, "progress_ms": 23000, "item": {
        "name": "Paused track", "artists": [{"name": "Artist"}],
        "album": {"name": "Album", "images": []}, "duration_ms": 180000,
        "external_urls": {"spotify": "https://open.spotify.com/track/fixture"}}}
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload)))
    with patch.object(cloud.httpx, "AsyncClient", return_value=client):
        asyncio.run(cloud.sync_spotify_status(user, AsyncMock(), process))
    assert process.await_args.args[2:5] == ("Paused track", "Artist", None)
    assert process.await_args.args[8] is False


def test_inactive_other_service_cannot_replace_fresh_playback(client, db, listener):
    user, headers = listener
    client.post('/api/scrobble', headers=headers, json=report('Active', 'plat'))
    old_pause = {**report('Old selection', 'spotify'), 'is_playing': False, 'progress_sec': 80}
    assert client.post('/api/scrobble', headers=headers, json=old_pause).json()['status'] == 'ignored_inactive'
    current = client.get(f'/api/current-track/{user.username}', headers=headers).json()
    assert current['playing'] is True
    assert current['title'] == 'Active'
    assert db.query(Scrobble).count() == 1
    # Pausing the actual current track is still processed immediately.
    actual_pause = {**report('Active', 'plat'), 'is_playing': False, 'progress_sec': 1}
    assert client.post('/api/scrobble', headers=headers, json=actual_pause).json()['status'] == 'ok'
    assert db.query(Scrobble).one().is_playing is False
