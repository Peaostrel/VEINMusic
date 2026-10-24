"""Last.fm history import: duplicates, counting, XP, achievements, one-time lock."""
import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import httpx
import pytest

from app.core.security import create_session_token
from app.models import (
    Achievement,
    LastfmImportJob,
    Scrobble,
    Track,
    User,
    UserAchievement,
    UserIntegration,
    UserProfile,
)
from app.services import lastfm_import
from app.services.localized import relative_time
from app.services.scrobble_processor import _update_existing_track

T0 = 1_700_000_000  # 2023-11-14


@pytest.fixture
def owner(client, db):
    user = User(username="fmowner", hashed_password="fixture-hash", profile=UserProfile(),
                integration=UserIntegration(lastfm_username="fmowner", lastfm_verified=True))
    db.add(user)
    db.commit()
    client.headers.update({"Origin": "http://localhost:3000"})
    client.cookies.set("api_key", create_session_token(str(user.id), str(user.hashed_password)))
    return user


def lastfm_track(title: str, uts: int, artist: str = "Artist") -> dict:
    return {"name": title, "artist": {"#text": artist}, "album": {"#text": "Album"},
            "image": [{"#text": "https://lastfm.freetls.fastly.net/i/u/300x300/"
                                "2a96cbd8b46e442fc41c2b86b821562f.png"}],
            "date": {"uts": str(uts)}}


def run_import(db, user, tracks: list[dict]) -> LastfmImportJob:
    """Run one import job against a fake Last.fm that returns ``tracks``."""
    job, needs_enqueue = lastfm_import.prepare_import_job(db, user)
    assert needs_enqueue

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"recenttracks": {
            "track": tracks, "@attr": {"totalPages": "1", "total": str(len(tracks))}}})

    real_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    async def no_sleep(_):
        return None

    with patch.object(lastfm_import, "LASTFM_API_KEY", "test-key"), \
         patch.object(lastfm_import.httpx, "AsyncClient", client_factory), \
         patch.object(lastfm_import.asyncio, "sleep", no_sleep):
        asyncio.run(lastfm_import.run_import_job(job.id))
    db.expire_all()
    return db.get(LastfmImportJob, job.id)


def live_play(db, user, title: str, at: datetime, duration: int = 200) -> Scrobble:
    track = db.query(Track).filter_by(title=title, artist="Artist").first()
    if track is None:
        track = Track(title=title, artist="Artist", duration=duration)
        db.add(track)
        db.flush()
    row = Scrobble(user_id=user.id, track_id=track.id, source="yandex", played_at=at, updated_at=at,
                   listened_sec=duration, is_playing=False, xp_earned=1)
    db.add(row)
    db.commit()
    return row


def imported(db, user) -> list[Scrobble]:
    return db.query(Scrobble).filter_by(user_id=user.id, is_imported=True).order_by(Scrobble.played_at).all()


def test_imported_plays_keep_original_time_and_count(client, db, owner):
    job = run_import(db, owner, [lastfm_track("Song", T0 + 600), lastfm_track("Song", T0),
                                 {**lastfm_track("Playing", T0 + 900), "@attr": {"nowplaying": "true"}}])
    assert job.status == "completed"
    assert job.imported_tracks == 2
    rows = imported(db, owner)
    assert [int(r.played_at.replace(tzinfo=UTC).timestamp()) for r in rows] == [T0, T0 + 600]
    assert all(r.source == "lastfm" and r.xp_earned == 1 for r in rows)
    # Both plays of the same song land on one catalog track, without the grey star cover
    assert len({r.track_id for r in rows}) == 1
    assert rows[0].track.cover_url in (None, "")

    stats = client.get("/api/stats/fmowner").json()
    assert stats["total_scrobbles"] == 2
    db.refresh(owner.integration)  # plus XP of achievements the import unlocked
    assert stats["total_xp"] == 2 + int(owner.integration.bonus_xp or 0)
    assert stats["top_tracks"][0]["plays"] == 2


def test_favourites_earn_double_xp_like_live_plays(db, owner):
    owner.profile.favorite_artist = "Loved"
    owner.profile.favorite_album = "Best album"
    db.commit()
    run_import(db, owner, [
        lastfm_track("Any", T0, artist="Loved"),
        {**lastfm_track("Other", T0 + 300), "album": {"#text": "Best album"}},
        lastfm_track("Plain", T0 + 600),
    ])
    xp = {r.track.title: r.xp_earned for r in imported(db, owner)}
    # A play matching several favourites still earns 2, as live
    assert xp == {"Any": 2, "Other": 2, "Plain": 1}


def test_import_uses_the_existing_catalog_track(db, owner):
    track = Track(title="Song", artist="Artist", duration=240, cover_url="https://example.com/c.jpg")
    db.add(track)
    db.commit()
    run_import(db, owner, [lastfm_track("song", T0, artist="ARTIST")])
    (row,) = imported(db, owner)
    assert row.track_id == track.id
    assert row.listened_sec == 240


def test_plays_vein_already_has_are_not_duplicated(db, owner):
    base = datetime.fromtimestamp(T0, tz=UTC)
    # Exported by VEIN to Last.fm: Last.fm keeps whole seconds
    live_play(db, owner, "Exported", base + timedelta(microseconds=400_000))
    # Sent by another scrobbler a little later, same song
    live_play(db, owner, "Nearby", base + timedelta(seconds=1000))
    # Last.fm renamed the track, but it is the same moment
    live_play(db, owner, "Original name", base + timedelta(seconds=2000))
    # A song played twice in a row, VEIN caught only the first play
    live_play(db, owner, "Twice", base + timedelta(seconds=3000))

    job = run_import(db, owner, [
        lastfm_track("Twice", T0 + 3200),
        lastfm_track("Twice", T0 + 3000),
        lastfm_track("Corrected name", T0 + 2000),
        lastfm_track("Nearby", T0 + 1000 - 90),
        lastfm_track("Exported", T0),
        lastfm_track("Fresh", T0 - 5000),
    ])
    assert job.imported_tracks == 2
    assert sorted(r.track.title for r in imported(db, owner)) == ["Fresh", "Twice"]
    assert db.query(Scrobble).filter_by(user_id=owner.id).count() == 6


def test_imported_plays_stay_counted_when_duration_is_learned(client, db, owner):
    run_import(db, owner, [lastfm_track("Long song", T0)])
    (row,) = imported(db, owner)
    assert row.listened_sec == 180  # unknown duration: the placeholder

    # A live player reports the real, longer duration later
    _update_existing_track(db, row.track, "", "", 420, "")
    db.expire_all()
    assert db.get(Scrobble, row.id).listened_sec == 420
    assert client.get("/api/stats/fmowner").json()["total_scrobbles"] == 1


def test_achievements_unlock_after_import(db, owner):
    ach = Achievement(name="Три трека", icon="🎧", rule_type="total_scrobbles", rule_value=3, reward_xp=50)
    db.add(ach)
    db.commit()
    with patch("app.services.achievements.notify_achievements_unlocked") as notify:
        run_import(db, owner, [lastfm_track(f"Song {i}", T0 + i * 300) for i in range(3)])
    assert db.query(UserAchievement).filter_by(user_id=owner.id, achievement_id=ach.id).count() == 1
    db.refresh(owner.integration)
    assert owner.integration.bonus_xp >= 50
    notify.assert_called_once()
    assert ach.id in {a["id"] for a in notify.call_args.args[1]}


def test_import_is_one_time_until_undone(client, db, owner):
    with patch("app.routers.integrations.LASTFM_API_KEY", "k"), \
         patch("app.routers.integrations.enqueue_import"):
        job = run_import(db, owner, [lastfm_track("Song", T0)])
        assert client.get("/api/import/lastfm/status").json()["locked"] is True
        refused = client.post("/api/import/lastfm", json={})
        assert refused.status_code == 409
        assert refused.json()["detail"] == lastfm_import.ALREADY_IMPORTED
        assert client.get("/api/user/fmowner").json()["has_imported_lastfm"] is True

        # Undoing the import removes its plays, so Last.fm can be imported again
        assert client.delete(f"/api/me/imports/{job.id}").json()["removed"] == 1
        assert client.get("/api/import/lastfm/status").json()["locked"] is False
        assert client.post("/api/import/lastfm", json={}).json()["status"] == "import_started"


def test_empty_import_does_not_lock(db, owner):
    job = run_import(db, owner, [])
    assert job.status == "completed"
    assert not lastfm_import.import_locked(db, owner)
    run_import(db, owner, [lastfm_track("Song", T0)])
    assert lastfm_import.import_locked(db, owner)


def test_interrupted_import_can_still_be_resumed(db, owner):
    owner.integration.has_imported_lastfm = True
    failed = LastfmImportJob(user_id=owner.id, lastfm_username="fmowner", status="failed", current_page=2)
    db.add(failed)
    db.commit()
    job, needs_enqueue = lastfm_import.prepare_import_job(db, owner)
    assert (job.id, needs_enqueue) == (failed.id, True)


def test_old_dates_show_the_year():
    now = datetime(2026, 5, 20, 12, 0, tzinfo=UTC)
    assert relative_time(datetime(2026, 5, 12, tzinfo=UTC), "ru", now) == "12 мая"
    assert relative_time(datetime(2019, 5, 12, tzinfo=UTC), "ru", now) == "12 мая 2019"
    assert relative_time(datetime(2019, 5, 12, tzinfo=UTC), "en", now) == "May 12, 2019"


def test_incomplete_live_play_does_not_hide_the_lastfm_play(db, owner):
    base = datetime.fromtimestamp(T0, tz=UTC)
    partial = live_play(db, owner, "Cut short", base)
    partial.listened_sec = 30  # the player stopped reporting early
    db.commit()
    run_import(db, owner, [lastfm_track("Cut short", T0 + 20)])
    assert [r.track.title for r in imported(db, owner)] == ["Cut short"]


def test_deleted_play_is_not_brought_back(db, owner):
    row = live_play(db, owner, "Removed", datetime.fromtimestamp(T0, tz=UTC))
    row.deleted_at = datetime.now(UTC)
    db.commit()
    assert run_import(db, owner, [lastfm_track("Removed", T0)]).imported_tracks == 0


def test_legacy_flag_without_imported_plays_does_not_lock(db, owner):
    owner.integration.has_imported_lastfm = True
    db.commit()
    assert not lastfm_import.import_locked(db, owner)
    legacy = live_play(db, owner, "Legacy", datetime.fromtimestamp(T0, tz=UTC))
    legacy.is_imported, legacy.source = True, "lastfm"
    db.commit()
    assert lastfm_import.import_locked(db, owner)


def test_legacy_imported_plays_follow_the_learned_duration(db, owner):
    legacy = live_play(db, owner, "Legacy", datetime.fromtimestamp(T0, tz=UTC), duration=180)
    legacy.is_imported, legacy.source = True, "lastfm"
    db.commit()
    _update_existing_track(db, legacy.track, "", "", 400, "")
    db.expire_all()
    assert db.get(Scrobble, legacy.id).listened_sec == 400


def test_import_needs_a_confirmed_account(client, db, owner):
    owner.integration.lastfm_verified = False
    db.commit()
    with patch("app.routers.integrations.LASTFM_API_KEY", "k"), \
         patch("app.routers.integrations.enqueue_import") as enqueue:
        res = client.post("/api/import/lastfm", json={})
    assert res.status_code == 403
    assert res.json()["detail"] == lastfm_import.NOT_VERIFIED
    enqueue.assert_not_called()


def test_one_lastfm_history_goes_to_one_vein_account(db, owner):
    run_import(db, owner, [lastfm_track("Song", T0)])
    twin = User(username="twin", hashed_password="fixture-hash", profile=UserProfile(),
                integration=UserIntegration(lastfm_username="FMOWNER", lastfm_verified=True))
    db.add(twin)
    db.commit()
    with pytest.raises(lastfm_import.ImportAlreadyDone) as refused:
        lastfm_import.prepare_import_job(db, twin)
    assert refused.value.message == lastfm_import.TAKEN_ACCOUNT


def test_imported_history_is_not_taken_for_the_live_play(db, owner):
    from app.services.scrobble_processor import _locked_last_scrobble
    live = live_play(db, owner, "Now", datetime.now(UTC))
    run_import(db, owner, [lastfm_track("Old", T0)])  # inserted later: a higher id
    last, _ = _locked_last_scrobble(db, int(owner.id))
    assert last.id == live.id


def test_history_lists_new_plays_before_imported_ones(client, db, owner):
    live = live_play(db, owner, "Now", datetime.now(UTC) - timedelta(minutes=10))
    run_import(db, owner, [lastfm_track("Old", T0)])
    history = client.get("/api/history/fmowner").json()["history"]
    assert history[0]["id"] == live.id
    assert [item["title"] for item in history] == ["Now", "Old"]

    # Search pages follow the same order, and the cursor keeps it
    first = client.get("/api/me/library/search").json()
    assert [item["track"]["title"] for item in first["history"]][:2] == ["Now", "Old"]
    after_live = client.get("/api/me/library/search", params={"before": live.id}).json()
    assert [item["track"]["title"] for item in after_live["history"]] == ["Old"]


def test_stalled_import_shows_as_interrupted(client, db, owner):
    job = LastfmImportJob(user_id=owner.id, lastfm_username="fmowner", status="in_progress", current_page=91,
                          total_pages=131, updated_at=datetime.now(UTC) - timedelta(minutes=30))
    db.add(job)
    db.commit()
    status = client.get("/api/import/lastfm/status").json()
    assert status["status"] == "failed"
    assert status["error"] == lastfm_import.STOPPED
    assert status["locked"] is False


def test_worker_gives_the_import_enough_time():
    from app.worker import WorkerSettings
    job = next(f for f in WorkerSettings.functions if getattr(f, "name", None) == "import_lastfm")
    assert job.timeout_s >= 3600
