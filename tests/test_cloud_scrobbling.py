import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import httpx
import pytest

from app.database import SessionLocal
from app.models import User, UserIntegration
from app.services import cloud_scrobbling as cs


def _mock_http(handler):
    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)
    return patch.object(cs.httpx, "AsyncClient", side_effect=factory)


@pytest.fixture(autouse=True)
def _clear_track_cache(monkeypatch):
    # These provider unit tests use detached SimpleNamespace users and a mock
    # session. Persistence of source diagnostics is covered with real users
    # in test_service_quality.py.
    monkeypatch.setattr(cs, "record_health", MagicMock())
    cs._TRACK_INFO_CACHE.clear()
    yield
    cs._TRACK_INFO_CACHE.clear()


def _user(**integration):
    fields = {
        "spotify_access_token": "old",
        "spotify_refresh_token": "refresh",
        "yandex_token": "ya",
        "soundcloud_access_token": "sc-old",
        "soundcloud_refresh_token": "sc-refresh",
        "soundcloud_token_expires_at": None,
        "soundcloud_recent_tracks": None,
        "soundcloud_current_track": None,
        "soundcloud_track_started_at": None,
    }
    fields.update(integration)
    return SimpleNamespace(id=1, username="u", integration=SimpleNamespace(**fields))


SPOTIFY_PLAYING = {
    "is_playing": True,
    "progress_ms": 30000,
    "item": {
        "name": "Song",
        "artists": [{"name": "A"}, {"name": "B"}],
        "album": {"name": "Alb", "images": [{"url": "https://img"}]},
        "external_urls": {"spotify": "https://open.spotify.com/track/1"},
        "duration_ms": 200000,
    },
}


def test_spotify_sync_refreshes_expired_token():
    seen_tokens = []

    def handler(request):
        if request.url.host == "accounts.spotify.com":
            return httpx.Response(200, json={"access_token": "new"})
        token = request.headers["Authorization"].split()[1]
        seen_tokens.append(token)
        if token == "old":
            return httpx.Response(401)
        return httpx.Response(200, json=SPOTIFY_PLAYING)

    user, db, process = _user(), MagicMock(), AsyncMock()
    with _mock_http(handler):
        asyncio.run(cs.sync_spotify_status(user, db, process))
    assert seen_tokens == ["old", "new"]
    assert user.integration.spotify_access_token == "new"
    db.commit.assert_called_once()
    process.assert_awaited_once_with(
        db, user, "Song", "A, B", "https://img", "https://open.spotify.com/track/1",
        "spotify", 30, True, 200, "Alb", collector="cloud")


@pytest.mark.parametrize("payload", [{"is_playing": False}, {"is_playing": True, "item": None}])
def test_spotify_sync_ignores_paused_or_empty(payload):
    process = AsyncMock()
    with _mock_http(lambda request: httpx.Response(200, json=payload)):
        asyncio.run(cs.sync_spotify_status(_user(), MagicMock(), process))
    process.assert_not_awaited()


def test_spotify_refresh_failures():
    assert asyncio.run(cs.refresh_spotify_token(_user(spotify_refresh_token=None), MagicMock())) is None
    with _mock_http(lambda request: httpx.Response(400)):
        assert asyncio.run(cs.refresh_spotify_token(_user(), MagicMock())) is None

    def boom(request):
        raise httpx.ConnectError("down")
    with _mock_http(boom):
        assert asyncio.run(cs.refresh_spotify_token(_user(), MagicMock())) is None
        # sync swallows the error as well
        asyncio.run(cs.sync_spotify_status(_user(), MagicMock(), AsyncMock()))


def _soundcloud_track(track_id="soundcloud:tracks:2", title="New Song"):
    return {
        "urn": track_id,
        "title": title,
        "duration": 192000,
        "permalink_url": f"https://soundcloud.com/test/{track_id.rsplit(':', 1)[-1]}",
        "artwork_url": "https://i1.sndcdn.com/artworks-test-large.jpg",
        "user": {"username": "Test Artist"},
        "publisher_metadata": {"album_title": "Test Album"},
    }


def test_soundcloud_history_detects_same_track_replay():
    assert cs._new_soundcloud_items(["A", "B", "C"], ["A", "A", "B"]) == ["A"]
    assert cs._new_soundcloud_items(["A", "B"], ["A", "B"]) == []
    assert cs._new_soundcloud_items([], ["A"]) == []
    assert cs._new_soundcloud_items(["A"], ["X", "Y"]) == []


def test_soundcloud_sync_baselines_then_reports_new_track():
    old = _soundcloud_track("soundcloud:tracks:1", "Old Song")
    new = _soundcloud_track()
    user, db, process = _user(), MagicMock(), AsyncMock()

    with _mock_http(lambda request: httpx.Response(200, json={"collection": [old]})):
        asyncio.run(cs.sync_soundcloud_status(user, db, process))
    process.assert_not_awaited()
    assert cs._soundcloud_history(user.integration.soundcloud_recent_tracks) == [
        "soundcloud:tracks:1"
    ]

    with _mock_http(lambda request: httpx.Response(
            200, json={"collection": [new, old]})):
        asyncio.run(cs.sync_soundcloud_status(user, db, process))
    process.assert_awaited_once_with(
        db,
        user,
        "New Song",
        "Test Artist",
        "https://i1.sndcdn.com/artworks-test-t500x500.jpg",
        "https://soundcloud.com/test/2",
        "soundcloud",
        0,
        True,
        192,
        "Test Album",
        collector="cloud",
    )


def test_soundcloud_refresh_rotates_tokens():
    user, db = _user(), MagicMock()

    def handler(request):
        assert request.url.host == "secure.soundcloud.com"
        return httpx.Response(200, json={
            "access_token": "sc-new",
            "refresh_token": "sc-refresh-new",
            "expires_in": 3600,
        })

    with patch.object(cs, "SOUNDCLOUD_CLIENT_ID", "client"), \
            patch.object(cs, "SOUNDCLOUD_CLIENT_SECRET", "secret"), \
            _mock_http(handler):
        assert asyncio.run(cs.refresh_soundcloud_token(user, db)) == "sc-new"
    assert user.integration.soundcloud_refresh_token == "sc-refresh-new"
    assert user.integration.soundcloud_token_expires_at > datetime.now(UTC)
    db.commit.assert_called_once()


def test_parse_yandex_now_playing():
    data = {"result": {"nowPlaying": {"progressMs": 5000, "track": {
        "title": "T", "artists": [{"name": "A"}, "junk"], "coverUri": "c/%%", "id": 9,
        "durationMs": 180000, "albums": [{"title": "Alb"}]}}}}
    assert cs._parse_yandex_now_playing(data) == {
        "title": "T", "artist": "A", "cover": "https://c/400x400",
        "track_url": "https://music.yandex.ru/track/9", "duration": 180, "progress": 5, "album": "Alb"}
    assert cs._parse_yandex_now_playing({}) is None
    assert cs._parse_yandex_now_playing({"result": {"nowPlaying": None}}) is None
    assert cs._parse_yandex_now_playing({"result": {"nowPlaying": {"track": "x"}}}) is None


def test_queue_changed_at():
    now = datetime.now(UTC)
    assert cs._queue_changed_at({}) is None
    assert cs._queue_changed_at({"modified": "not a date"}) is None
    assert cs._queue_changed_at({"modified": now.isoformat().replace("+00:00", "Z")}) == now


def test_estimate_queue_position():
    now = datetime(2026, 9, 27, 12, 0, tzinfo=UTC)
    est = cs._estimate_queue_position
    assert est(None, 200, now) == (0, True)
    assert est(now + timedelta(seconds=5), 200, now) == (0, True)  # clock skew
    # A 200 s track still plays two minutes after it started: the old
    # 60-second rule stopped counting here, so long tracks never scored
    assert est(now - timedelta(seconds=120), 200, now) == (120, True)
    # Within the margin after its end it still counts (poll interval)...
    assert est(now - timedelta(seconds=230), 200, now) == (200, True)
    # ...but not later: the queue is idle
    assert est(now - timedelta(minutes=10), 200, now) == (200, False)
    # Unknown length: assume 3 minutes
    assert est(now - timedelta(seconds=100), 0, now) == (100, True)


def _yandex_handler(queue_status=200, queues=None, current_index=1):
    fresh = datetime.now(UTC).isoformat()

    def handler(request):
        path = request.url.path
        if path == "/queues":
            return httpx.Response(queue_status, json={"result": {"queues": queues if queues is not None else [
                {"id": "old", "modified": "2020-01-01T00:00:00Z"},
                {"id": "q1", "modified": fresh},
            ]}})
        if path == "/queues/q1":
            return httpx.Response(200, json={"result": {"currentIndex": current_index, "tracks": [
                {"trackId": "1"}, {"trackId": "2"}]}})
        if path == "/tracks":
            return httpx.Response(200, json={"result": [{
                "title": "YT", "artists": [{"name": "YA"}], "coverUri": "y/%%",
                "durationMs": 120000, "albums": [{"title": "YAlb"}]}]})
        return httpx.Response(404)
    return handler


def _no_ynison():
    """Ynison unreachable: the sync falls back to the REST play queue."""
    return patch.object(cs.yandex_ynison, "fetch_playback",
                        new=AsyncMock(side_effect=OSError("ynison down")))


def test_yandex_sync_uses_ynison_playback():
    user, db, process = _user(), MagicMock(), AsyncMock()
    playback = cs.yandex_ynison.Playback("2", True, 95, 120)
    with patch.object(cs.yandex_ynison, "fetch_playback", new=AsyncMock(return_value=playback)), \
            _mock_http(_yandex_handler(queues=[])):
        asyncio.run(cs.sync_yandex_status(user, db, process))
    process.assert_awaited_once_with(
        db, user, "YT", "YA", "https://y/400x400", "https://music.yandex.ru/track/2",
        "yandex", 95, True, 120, "YAlb", collector="cloud")


def test_yandex_sync_ynison_nothing_playing_skips_queue():
    process = AsyncMock()
    with patch.object(cs.yandex_ynison, "fetch_playback", new=AsyncMock(return_value=None)), \
            patch.object(cs, "_sync_yandex_queue", new=AsyncMock()) as queue:
        asyncio.run(cs.sync_yandex_status(_user(), MagicMock(), process))
    process.assert_not_awaited()
    queue.assert_not_awaited()


def test_yandex_sync_processes_current_track():
    user, db, process = _user(), MagicMock(), AsyncMock()
    with _no_ynison(), _mock_http(_yandex_handler()):
        asyncio.run(cs.sync_yandex_status(user, db, process))
    process.assert_awaited_once_with(
        db, user, "YT", "YA", "https://y/400x400", "https://music.yandex.ru/track/2",
        "yandex", ANY, True, 120, "YAlb", collector="cloud")
    assert process.await_args.args[7] < 5  # the queue changed just now


@pytest.mark.parametrize("kwargs", [
    {"queue_status": 401}, {"queues": []}, {"current_index": 5}, {"queues": [{"modified": "x"}]},
])
def test_yandex_sync_skips_when_nothing_to_do(kwargs):
    process = AsyncMock()
    with _no_ynison(), _mock_http(_yandex_handler(**kwargs)):
        asyncio.run(cs.sync_yandex_status(_user(), MagicMock(), process))
    process.assert_not_awaited()


def test_yandex_fetch_track_without_result():
    process = AsyncMock()

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(
                lambda r: httpx.Response(200, json={"result": []}))) as client:
            await cs._fetch_yandex_track_info(client, "1", {}, process, MagicMock(), _user())
    asyncio.run(run())
    process.assert_not_awaited()


def _linked_user(db, name, banned=False, **integration):
    user = User(username=name, hashed_password="x", is_banned=banned)
    db.add(user)
    db.flush()
    db.add(UserIntegration(user_id=user.id, **integration))
    db.commit()
    return user.id


def test_pollable_users_and_poll_user(db):
    spotify = _linked_user(db, "sp", spotify_refresh_token="r")
    yandex = _linked_user(db, "ya", yandex_token="t")
    soundcloud = _linked_user(db, "sc", soundcloud_refresh_token="r")
    _linked_user(db, "none")
    _linked_user(db, "banned", banned=True, yandex_token="t")
    assert sorted(cs.get_pollable_user_ids(db)) == sorted([spotify, yandex, soundcloud])

    with patch.object(cs.asyncio, "sleep", new=AsyncMock()), \
            patch.object(cs, "sync_spotify_status", new=AsyncMock()) as sp, \
            patch.object(cs, "sync_yandex_status", new=AsyncMock()) as ya, \
            patch.object(cs, "sync_soundcloud_status", new=AsyncMock()) as sc:
        asyncio.run(cs.poll_once(AsyncMock()))
        asyncio.run(cs.poll_user(999999, AsyncMock()))  # unknown user: no-op
    assert sp.await_count == 1
    assert ya.await_count == 1
    assert sc.await_count == 1

    check = SessionLocal()
    try:
        assert check.query(UserIntegration).filter_by(user_id=yandex).one().last_sync is not None
    finally:
        check.close()


def test_poll_once_respects_lock():
    redis = MagicMock()
    redis.set = AsyncMock(return_value=False)
    with patch("app.core.redis.get_redis_client", return_value=redis), \
            patch.object(cs, "_load_pollable_user_ids") as load:
        asyncio.run(cs.poll_once(AsyncMock()))
    load.assert_not_called()

    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(side_effect=RuntimeError("gone"))
    with patch("app.core.redis.get_redis_client", return_value=redis), \
            patch.object(cs, "_load_pollable_user_ids", return_value=[]):
        asyncio.run(cs.poll_once(AsyncMock()))
    redis.delete.assert_awaited_once()
