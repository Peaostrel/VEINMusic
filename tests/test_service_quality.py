"""Ownership, privacy, reversible history and live activation regressions."""
import json
from datetime import UTC, datetime, timedelta

import pytest

from app.core.security import create_session_token
from app.models import LastfmImportJob, Scrobble, Track, User, UserIntegration, UserProfile
from app.services.lastfm_import import _store_page
from app.services.source_health import record_health


@pytest.fixture
def people(client, db):
    users = []
    for name in ("alice", "bob"):
        user = User(username=name, hashed_password="fixture-hash", profile=UserProfile(), integration=UserIntegration())
        db.add(user)
        users.append(user)
    db.commit()
    client.headers.update({"Origin": "http://localhost:3000"})
    client.cookies.set("api_key", create_session_token(str(users[0].id), str(users[0].hashed_password)))
    return users


def play(db, user, artist="Artist", title="Track", days=0, imported=False, job_id=None):
    track = db.query(Track).filter_by(title=title, artist=artist).first()
    if not track:
        track = Track(title=title, artist=artist, duration=180, genre="Rock")
        db.add(track)
        db.flush()
    listen = Scrobble(user_id=user.id, track_id=track.id, listened_sec=180, is_playing=False,
                      is_imported=imported, import_job_id=job_id, source="spotify",
                      played_at=datetime.now(UTC) - timedelta(days=days))
    db.add(listen)
    db.commit()
    return listen


def test_exclusion_and_restore_affect_aggregates_not_maintenance(client, db, people):
    row = play(db, people[0])
    assert client.patch(f"/api/me/scrobbles/{row.id}/exclude", json={"excluded": True}).status_code == 200
    assert db.query(Scrobble).count() == 0
    history = client.get("/api/me/scrobbles/manage").json()
    assert len(history) == 1
    assert history[0]["excluded_from_stats"]
    assert client.get("/api/me/weekly-story").json()["plays"] == 0
    assert client.patch(f"/api/me/scrobbles/{row.id}/exclude", json={"excluded": False}).status_code == 200
    assert db.query(Scrobble).count() == 1
    assert client.get("/api/me/weekly-story").json()["plays"] == 1


def test_history_edit_never_mutates_other_users_catalog(client, db, people):
    mine = play(db, people[0])
    theirs = play(db, people[1])
    assert client.patch(f"/api/me/scrobbles/{mine.id}/metadata", json={"title": "Corrected", "artist": "Correct artist"}).status_code == 200
    db.expire_all()
    assert db.get(Scrobble, theirs.id).track.title == "Track"
    assert db.get(Scrobble, mine.id).track.title == "Corrected"
    assert client.patch(f"/api/me/scrobbles/{theirs.id}/metadata", json={"title": "No", "artist": "No"}).status_code == 404
    assert client.patch(f"/api/me/scrobbles/{theirs.id}/exclude", json={"excluded": True}).status_code == 404
    assert client.patch(f"/api/me/scrobbles/{mine.id}/metadata", json={"title": " ", "artist": "x"}).status_code == 422


def test_undo_import_is_scoped_and_idempotent(client, db, people):
    job = LastfmImportJob(user_id=people[0].id, lastfm_username="alice", status="completed")
    other_job = LastfmImportJob(user_id=people[1].id, lastfm_username="bob", status="completed")
    db.add_all([job, other_job]); db.commit()
    play(db, people[0], title="Imported", imported=True, job_id=job.id)
    play(db, people[0], title="Live")
    play(db, people[0], title="Legacy", imported=True)
    play(db, people[1], title="Other", imported=True, job_id=other_job.id)
    assert client.delete(f"/api/me/imports/{other_job.id}").status_code == 404
    assert client.delete(f"/api/me/imports/{job.id}").json()["removed"] == 1
    assert client.delete(f"/api/me/imports/{job.id}").json()["removed"] == 0
    assert db.query(Scrobble).count() == 3


def test_active_import_cannot_be_undone(client, db, people):
    job = LastfmImportJob(user_id=people[0].id, lastfm_username="alice", status="in_progress")
    db.add(job); db.commit()
    assert client.delete(f"/api/me/imports/{job.id}").status_code == 409


def test_import_store_preserves_batch_id(db, people):
    job = LastfmImportJob(user_id=people[0].id, lastfm_username="alice", status="in_progress")
    db.add(job); db.commit()
    count = _store_page(job.id, [{"name": "Imported", "artist": {"#text": "Artist"}, "date": {"uts": "1700000000"}}], 1, 1, 1)
    assert count == 1
    db.expire_all()
    assert db.query(Scrobble).one().import_job_id == job.id


@pytest.mark.parametrize("privacy", [{"statistics": "private"}, {"history": "private"}, {"statistics": "followers"}])
def test_shared_mix_respects_granular_privacy(client, db, people, privacy):
    play(db, people[0]); play(db, people[1])
    people[1].profile.preferences = json.dumps({"privacy": privacy})
    db.commit()
    assert client.get("/api/me/shared-mix/bob").status_code == 403


def test_shared_mix_and_taste_evolution(client, db, people):
    play(db, people[0], artist="New")
    play(db, people[0], artist="Returned", days=100)
    play(db, people[0], artist="Returned")
    play(db, people[0], artist="Faded", days=40)
    play(db, people[1], artist="New")
    evolution = client.get("/api/me/taste-evolution").json()
    assert [item["artist"] for item in evolution["new"]] == ["New"]
    assert [item["artist"] for item in evolution["returning"]] == ["Returned"]
    assert [item["artist"] for item in evolution["faded"]] == ["Faded"]
    mix = client.get("/api/me/shared-mix/bob").json()
    assert mix["common_artists"] == ["New"]
    assert mix["tracks"][0]["reason"] == "Вы оба слушаете New"


def test_feedback_changes_recommendations_and_reset(client, db, people):
    play(db, people[0], title="Mine")
    candidate = play(db, people[1], title="Recommendation").track_id
    recs = client.get("/api/recommendations/me").json()["recommendations"]
    assert candidate in [item["id"] for item in recs]
    assert client.post(f"/api/me/recommendations/{candidate}/feedback", json={"value": "dislike"}).status_code == 200
    assert not client.get("/api/recommendations/me").json()["recommendations"]
    client.post(f"/api/me/recommendations/{candidate}/feedback", json={"value": "reset"})
    assert client.get("/api/recommendations/me").json()["recommendations"]
    client.post(f"/api/me/recommendations/{candidate}/feedback", json={"value": "like"})
    assert client.get("/api/recommendations/me").json()["recommendations"][0]["reason_type"] == "feedback_similarity"


def test_like_without_genre_prioritizes_other_tracks_by_artist(client, db, people):
    liked = play(db, people[1], artist="Liked artist", title="Liked")
    candidate = play(db, people[1], artist="Liked artist", title="Another")
    liked.track.genre = None
    candidate.track.genre = None
    for index in range(12):
        play(db, people[1], artist="Popular artist", title=f"Popular {index}")
    db.commit()
    client.post(f"/api/me/recommendations/{liked.track_id}/feedback", json={"value": "like"})
    recs = client.get("/api/recommendations/me").json()["recommendations"]
    recommendation = next(item for item in recs if item["id"] == candidate.track_id)
    assert recommendation["reason_type"] == "feedback_similarity"
    assert recommendation["confidence_score"] > 0.9
    assert recs[0]["artist"] == "Liked artist"


def test_hidden_listeners_do_not_supply_recommendations(client, db, people):
    play(db, people[0], title="Mine")
    play(db, people[1], title="Secret")
    people[1].profile.preferences = json.dumps({"privacy": {"history": "private"}})
    db.commit()
    assert not client.get("/api/recommendations/me").json()["recommendations"]


def test_connection_verification_ignores_import_and_old_event(client, db, people):
    play(db, people[0], imported=True)
    assert not client.get("/api/me/connection-check?source=spotify").json()["received"]
    play(db, people[0], title="Live")
    result = client.get("/api/me/connection-check?source=spotify").json()
    assert result["received"]
    assert result["counted"]
    future = (datetime.now(UTC) + timedelta(seconds=10)).isoformat()
    assert not client.get("/api/me/connection-check", params={"source": "spotify", "since": future}).json()["received"]


def test_diagnostics_and_admin_activation(client, db, people):
    record_health(db, people[0].id, "Spotify", "token_expired")
    assert "Переподключите" in client.get("/api/me/connection-check?source=spotify").json()["message"]
    assert client.get("/api/admin/quality").status_code == 403
    play(db, people[1], imported=True)
    play(db, people[0])
    record_health(db, people[0].id, "spotify", "ok", 15)
    people[0].role = "admin"; db.commit()
    result = client.get("/api/admin/quality").json()
    assert result["registered"] == 2
    assert result["activated"] == 1
    assert result["sources"][0]["errors"] == 1
    assert result["sources"][0]["verified_accounts"] == 1


def test_cloud_expired_token_is_persisted(db, people, monkeypatch):
    import asyncio
    from unittest.mock import AsyncMock
    import httpx
    from app.models import SourceHealth
    from app.services import cloud_scrobbling
    user = people[0]
    user.integration.spotify_access_token = "expired"
    user.integration.spotify_refresh_token = "expired-refresh"
    db.commit()
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(401))
    monkeypatch.setattr(cloud_scrobbling.httpx, "AsyncClient", lambda **kwargs: real_client(transport=transport))
    asyncio.run(cloud_scrobbling.sync_spotify_status(user, db, AsyncMock()))
    assert db.query(SourceHealth).one().status == "token_expired"


def test_exclusion_filters_raw_sql_taste_and_leaderboard(client, db, people):
    from app.services.taste import get_taste_match_internal
    first = play(db, people[0])
    play(db, people[1])
    assert get_taste_match_internal("alice", "bob", db)["match"] == 100
    client.patch(f"/api/me/scrobbles/{first.id}/exclude", json={"excluded": True})
    assert get_taste_match_internal("alice", "bob", db)["match"] == 0
    assert client.get("/api/taste-match/alice/bob").json()["match"] == 0


def test_excluded_listens_cannot_bypass_abuse_limits(client, db, people):
    from app.routers.scrobbling import _anti_abuse_check
    from app.services.antifraud import _check_hourly_velocity, _check_micro_tracks
    track = Track(title="Excluded", artist="Artist", duration=180)
    db.add(track); db.flush()
    now = datetime.now(UTC)
    db.add_all([Scrobble(user_id=people[0].id, track_id=track.id, source="desktop",
                        played_at=now - timedelta(minutes=1), updated_at=now - timedelta(minutes=1),
                        listened_sec=0, xp_earned=1, excluded_from_stats=True) for _ in range(71)])
    db.commit()
    assert db.query(Scrobble).count() == 0
    assert _anti_abuse_check(db, people[0].id)["status"] == "flagged"
    assert _check_hourly_velocity(people[0].id, db, now - timedelta(hours=1))[0] == 45
    assert _check_micro_tracks(people[0].id, db)[0] == 40


@pytest.mark.parametrize("source", ["yandex_music", "youtube_music", "Spotify-Web", "soundcloud"])
def test_extension_check_does_not_accept_another_provider(client, db, people, source):
    row = play(db, people[0])
    row.source = source
    db.commit()
    assert not client.get("/api/me/connection-check?source=extension").json()["received"]


def test_long_weekly_story_fits_notification_and_deduplicates(db, people):
    from app.models import Notification
    from app.services.recap_notifications import create_due_recap_notifications
    from app.services.user_preferences import get_preferences, save_preferences
    user = people[0]
    preferences = get_preferences(user.profile)
    preferences.wrapped.auto_weekly = True
    preferences.wrapped.auto_monthly = False
    preferences.notifications.in_app.weekly_digest = True
    save_preferences(user.profile, preferences)
    row = play(db, user, artist="Очень длинное имя исполнителя " * 9)
    now = datetime(2026, 10, 5, 6, tzinfo=UTC)
    row.played_at = now - timedelta(days=1)
    db.commit()
    ids = create_due_recap_notifications(now)
    assert len(ids) == 1
    message = db.get(Notification, ids[0]).message
    assert len(message) <= 200
    assert message.startswith("Недельные итоги")
    assert create_due_recap_notifications(now) == []


def test_yandex_provider_error_is_persisted(db, people, monkeypatch):
    import asyncio
    from unittest.mock import AsyncMock
    import httpx
    from app.models import SourceHealth
    from app.services import cloud_scrobbling
    user = people[0]
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(429))
    monkeypatch.setattr(cloud_scrobbling.httpx, "AsyncClient", lambda **kwargs: real_client(transport=transport))
    asyncio.run(cloud_scrobbling._sync_yandex_queue(user, db, AsyncMock(), {}))
    row = db.query(SourceHealth).one()
    assert row.status == "provider_error"
    assert row.error_count == 1
