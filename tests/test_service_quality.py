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
    assert len(history) == 1 and history[0]["excluded_from_stats"]
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
    assert result["received"] and result["counted"]
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
    assert result["registered"] == 2 and result["activated"] == 1
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
