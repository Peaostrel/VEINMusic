import asyncio
from unittest.mock import AsyncMock, patch

from app.services import yandex_live as live
from app.services.yandex_ynison import Playback


class _NoLock:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _listener():
    return live.UserListener(7, "tok", AsyncMock())


def test_track_switch_is_reported_at_once_duplicates_are_not():
    lis = _listener()
    with patch.object(lis, "_report", new=AsyncMock()) as report:
        async def run():
            await lis.on_playback(Playback("1", True, 3, 200))
            lis._last_reported = ("1", True)
            await lis.on_playback(Playback("1", True, 10, 200))   # volume change etc.
            await lis.on_playback(Playback("2", True, 0, 180))    # track switch
            lis._last_reported = ("2", True)
            await lis.on_playback(Playback("2", False, 40, 180))  # pause
        asyncio.run(run())
    assert [c.args for c in report.await_args_list] == [
        ("1", 3, True), ("2", 0, True), ("2", 40, False)]


def test_same_track_restarted_is_reported():
    lis = _listener()
    lis.playback, lis.received_ms, lis._last_reported = Playback("1", True, 150, 200), 0, ("1", True)
    with patch.object(lis, "_report", new=AsyncMock()) as report, \
            patch.object(live, "_now_ms", return_value=10_000):
        asyncio.run(lis.on_playback(Playback("1", True, 0, 200)))
    report.assert_awaited_once_with("1", 0, True)


def test_current_position_extrapolates_and_detects_stale():
    lis = _listener()
    assert lis.current_position() is None
    lis.playback, lis.received_ms = Playback("1", True, 10, 200), 1_000_000
    assert lis.current_position(1_050_000) == (60, True)
    assert lis.current_position(1_000_000 + 250_000) == (200, False)
    lis.playback = Playback("1", False, 10, 200)
    assert lis.current_position(1_050_000) == (10, False)


def test_spam_guard_retry():
    lis = _listener()

    once = AsyncMock(side_effect=["ignored_spam_protection", "ok"])
    with patch("app.core.redis.redis_lock", return_value=_NoLock()), \
            patch.object(lis, "_report_once", new=once), \
            patch.object(live.asyncio, "sleep", new=AsyncMock()):
        asyncio.run(lis._report("5", 0, True))
    assert once.await_count == 2
    assert lis._last_reported == ("5", True)


def test_reconcile_starts_stops_and_restarts_on_new_token():
    started, stopped = [], []

    def fake_start(self):
        started.append((self.user_id, self.token))

    async def fake_stop(self):
        stopped.append((self.user_id, self.token))

    with patch.object(live.UserListener, "start", fake_start), \
            patch.object(live.UserListener, "stop", fake_stop):
        mgr = live.LiveManager(AsyncMock())

        async def run():
            await mgr.reconcile({1: "a", 2: "b"})
            await mgr.reconcile({1: "a", 2: "c"})   # token changed
            await mgr.reconcile({2: "c"})           # user 1 unlinked
        asyncio.run(run())
    assert started == [(1, "a"), (2, "b"), (2, "c")]
    assert stopped == [(2, "b"), (1, "a")]


def test_load_linked_users(db):
    from app.models import User, UserIntegration
    for name, banned, token in [("ya1", False, "t1"), ("ya2", True, "t2"), ("none", False, None)]:
        user = User(username=name, hashed_password="x", is_banned=banned)
        db.add(user)
        db.flush()
        db.add(UserIntegration(user_id=user.id, yandex_token=token))
    db.commit()
    tokens = sorted(live.load_linked_users().values())
    assert tokens == ["t1"]


def test_poll_skips_users_with_live_connection(db):
    from app.models import User, UserIntegration
    from app.services import cloud_scrobbling as cs
    user = User(username="liveu", hashed_password="x")
    db.add(user)
    db.flush()
    db.add(UserIntegration(user_id=user.id, yandex_token="t"))
    db.commit()
    with patch.object(cs, "sync_yandex_status", new=AsyncMock()) as sync, \
            patch.object(cs.asyncio, "sleep", new=AsyncMock()):
        live.connected.add(user.id)
        try:
            asyncio.run(cs.poll_user(user.id, AsyncMock()))
        finally:
            live.connected.discard(user.id)
        sync.assert_not_awaited()
        asyncio.run(cs.poll_user(user.id, AsyncMock()))
        sync.assert_awaited_once()


def test_track_switch_reaches_history_immediately(client, db):
    """Ynison pushes a track, then a switch: the user's history shows the new
    track right away, without waiting for a poll. The switch arrives within a
    second of the first report, so it also goes through the spam-guard retry
    (a real ~1 s wait: the guard compares wall-clock time)."""
    from app.models import User, UserIntegration
    from app.services import cloud_scrobbling as cs
    from app.services.scrobble_processor import process_scrobble

    user = User(username="liveflow", hashed_password="x")
    db.add(user)
    db.flush()
    db.add(UserIntegration(user_id=user.id, yandex_token="tok"))
    db.commit()

    infos = {"1": {"title": "First", "artist": "A", "cover": None, "duration": 200, "album": None},
             "2": {"title": "Second", "artist": "B", "cover": None, "duration": 180, "album": None}}

    async def fake_info(client, track_id, headers, username):
        return infos[track_id]

    async def fake_listen(token, on_playback, on_open=None):
        on_open()
        await on_playback(Playback("1", True, 0, 200))
        await asyncio.sleep(0)
        await on_playback(Playback("2", True, 0, 180))

    lis = live.UserListener(user.id, "tok", process_scrobble)
    with patch.object(cs, "_yandex_track_info", new=fake_info), \
            patch.object(live.yandex_ynison, "listen", new=fake_listen), \
            patch("app.core.redis.redis_lock", side_effect=lambda *a, **k: _NoLock()), \
            patch("app.services.scrobble_processor.get_track_genre", new=AsyncMock(return_value=None)), \
            patch("app.services.scrobble_processor.manager.broadcast_to_user", new=AsyncMock()):
        asyncio.run(live.yandex_ynison.listen("tok", lis.on_playback, on_open=lambda: None))

    history = client.get("/api/history/liveflow").json()["history"]
    assert [h["title"] for h in history][:1] == ["Second"]
    assert history[0]["is_playing"] is True


def _web_state(track, pos, dur, event_s, version):
    """A state written by the music.yandex.ru web player: it is not in the
    device list and always says paused=True."""
    stamp = {"device_id": "web", "version": version, "timestamp_ms": (1000 + event_s) * 1000}
    return {
        "player_state": {
            "player_queue": {"current_playable_index": 0,
                             "playable_list": [{"playable_id": track, "playable_type": "TRACK"}]},
            "status": {"paused": True, "progress_ms": pos * 1000, "duration_ms": dur * 1000,
                       "version": stamp},
        },
        "devices": [{"info": {"device_id": "phone", "type": "IOS"}, "is_offline": True}],
    }


def test_web_player_play_pause_resume_seek_are_inferred():
    """The event order recorded on production: start, pause after 24 s,
    resume 14 s later, next track, seek to the middle."""
    from app.services.yandex_ynison import parse_state

    lis = _listener()
    clock = {"s": 0}
    reported = []

    async def report(track_id, progress, playing):
        reported.append((track_id, progress, playing))
        lis._last_reported = (track_id, playing)

    events = [  # (receive time, state)
        (0, _web_state("A", 0, 262, 0, 1)),     # start
        (8, _web_state("A", 0, 262, 0, 1)),     # the same event pushed again
        (24, _web_state("A", 24, 262, 24, 2)),  # pause
        (36, _web_state("A", 24, 262, 24, 2)),  # pushed again
        (38, _web_state("A", 24, 262, 38, 3)),  # resume
        (50, _web_state("B", 0, 88, 50, 4)),    # next track
        (52, _web_state("B", 42, 88, 52, 5)),   # seek
    ]
    states = []
    with patch.object(lis, "_report", new=report), \
            patch.object(live, "_now_ms", side_effect=lambda: (1000 + clock["s"]) * 1000):
        async def run():
            for at, state in events:
                clock["s"] = at
                await lis.on_playback(parse_state(state, now_ms=(1000 + at) * 1000))
                states.append((lis.playback.track_id, lis.playback.playing))
        asyncio.run(run())

    assert states == [("A", True), ("A", True), ("A", False), ("A", False),
                      ("A", True), ("B", True), ("B", True)]
    assert reported == [("A", 0, True), ("A", 24, False), ("A", 24, True), ("B", 0, True)]
    assert lis.current_position(1_062_000) == (52, True)  # playing on from the seek


def test_web_player_state_found_on_connect():
    """The first state after connecting may be long over."""
    from app.services.yandex_ynison import parse_state

    for age_s, playing in ((60, True), (3600, False)):
        lis = _listener()
        with patch.object(lis, "_report", new=AsyncMock()), \
                patch.object(live, "_now_ms", return_value=11_000_000):
            asyncio.run(lis.on_playback(parse_state(
                _web_state("A", 30, 200, 10_000 - age_s, 1), now_ms=11_000_000)))
        assert lis.playback.playing is playing


def test_app_state_is_trusted():
    """A listed device (the app) reports pause itself: no inference."""
    from app.services.yandex_ynison import parse_state

    state = _web_state("A", 30, 200, 100, 1)
    state["player_state"]["status"]["version"]["device_id"] = "phone"
    pb = parse_state(state, now_ms=1_101_000)
    assert pb.pause_unknown is False
    assert pb.playing is False
