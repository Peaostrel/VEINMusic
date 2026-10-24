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
                integration=UserIntegration(lastfm_username="fmowner"))
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
