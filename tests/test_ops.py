"""Operational endpoints and background polling."""
import asyncio
from unittest.mock import AsyncMock, patch

from app.services import cloud_scrobbling


def test_health_reports_database(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["redis"] in ("ok", "unavailable")


def test_poll_once_skips_when_another_process_holds_the_lock():
    fake_redis = AsyncMock()
    fake_redis.set.return_value = False  # lock already taken
    with patch("app.core.redis.get_redis_client", return_value=fake_redis), \
         patch.object(cloud_scrobbling, "get_pollable_user_ids") as get_ids:
        asyncio.run(cloud_scrobbling.poll_once(AsyncMock()))
    get_ids.assert_not_called()


def test_poll_once_polls_and_releases_lock():
    fake_redis = AsyncMock()
    fake_redis.set.return_value = True
    with patch("app.core.redis.get_redis_client", return_value=fake_redis), \
         patch.object(cloud_scrobbling, "get_pollable_user_ids", return_value=[1, 2]), \
         patch.object(cloud_scrobbling, "poll_user", new=AsyncMock()) as poll_user:
        asyncio.run(cloud_scrobbling.poll_once(AsyncMock()))
    assert poll_user.await_count == 2
    fake_redis.delete.assert_awaited_once_with(cloud_scrobbling.POLL_LOCK_KEY)


def test_together_room_is_removed_after_everyone_leaves(client):
    origin = {"Origin": "http://localhost:3000"}
    with client.websocket_connect("/ws/together/cleanup-room", headers=origin) as ws:
        assert ws.receive_json()["type"] == "ROOM_STATE"
        rooms = client.get("/api/together/rooms").json()["rooms"]
        assert any(r["room_id"] == "cleanup-room" for r in rooms)
    rooms = client.get("/api/together/rooms").json()["rooms"]
    assert not any(r["room_id"] == "cleanup-room" for r in rooms)
