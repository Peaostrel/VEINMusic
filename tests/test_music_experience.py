"""Personal search, local-day privacy and portable history regressions."""
from datetime import UTC, datetime, timedelta
import csv
import io

import pytest

from app.models import ListenLater, Scrobble, Track, User, UserProfile, UserIntegration


@pytest.fixture
def owner(client, db):
    assert client.post("/auth/register", json={"username": "experience", "password": "experience-test-password"}).status_code == 200
    client.headers["Origin"] = "http://localhost:3000"
    return db.query(User).filter_by(username="experience").one()


def add_play(db, owner, title="Own song", artist="Own artist", when=None, **values):
    track = Track(title=title, artist=artist, album="Own album", duration=180)
    db.add(track)
    db.flush()
    row = Scrobble(user_id=owner.id, track_id=track.id, played_at=when or datetime.now(UTC),
                   source="spotify", listened_sec=180, **values)
    db.add(row)
    db.commit()
    return row


def test_search_is_personal_and_includes_saved_and_filters(client, db, owner):
    own = add_play(db, owner)
    other = User(username="other", hashed_password="x", profile=UserProfile(), integration=UserIntegration())
    db.add(other)
    db.commit()
    add_play(db, other, title="Other song")
    db.add(ListenLater(user_id=owner.id, track_id=own.track_id, note="Private note"))
    db.commit()
    data = client.get("/api/me/library/search?q=Own").json()
    assert [row["track"]["title"] for row in data["history"]] == ["Own song"]
    assert data["artists"][0]["artist"] == "Own artist"
    assert data["albums"][0]["album"] == "Own album"
    assert data["saved"][0]["note"] == "Private note"
    assert client.get("/api/me/library/search?source=yandex").json()["history"] == []
    assert client.get("/api/me/library/search?date_from=2025-02-01&date_to=2025-01-01").status_code == 422


def test_calendar_range_respects_local_dates_and_history_privacy(client, db, owner):
    owner.profile.location = "Россия, Москва"
    db.commit()
    add_play(db, owner, when=datetime(2025, 1, 1, 22, tzinfo=UTC))
    path = "/api/stats/calendar/experience/range?date_from=2025-01-02&date_to=2025-01-02"
    data = client.get(path).json()
    assert data["scrobbles"] == 1
    assert data["minutes"] == 3
    assert data["artists"][0]["artist"] == "Own artist"
    owner.profile.preferences = '{"privacy":{"history":"private","statistics":"all"}}'
    db.commit()
    client.cookies.clear()
    assert client.get(path).status_code == 403


def test_memories_use_local_anniversary(client, db, owner):
    owner.profile.location = "Россия, Москва"
    db.commit()
    add_play(db, owner, when=datetime(2024, 1, 1, 22, tzinfo=UTC))
    data = client.get("/api/me/memories?on=2025-01-02").json()
    assert len(data["on_this_day"]) == 1
    assert client.get("/api/me/memories?on=9999-01-01").status_code == 422


def test_streaming_export_round_trip_preserves_exclusion_and_no_rewards(client, db, owner):
    add_play(db, owner, when=datetime(2024, 1, 1, tzinfo=UTC), excluded_from_stats=True)
    exported = client.get("/api/account/export").json()
    assert exported["format"] == "veinmusic"
    assert exported["scrobbles"][0]["excluded_from_stats"] is True
    assert exported["scrobbles"][0]["duration"] == 180
    payload = {"scrobbles": exported["scrobbles"]}
    preview = client.post("/api/account/history/preview", json=payload).json()
    assert preview["new"] == 0 and preview["duplicates"] == 1
    new = dict(exported["scrobbles"][0], played_at="2024-01-02T00:00:00Z")
    payload = {"scrobbles": [new, new]}
    preview = client.post("/api/account/history/preview", json=payload).json()
    assert preview["new"] == 1 and preview["duplicates"] == 1
    payload["preview_token"] = preview["preview_token"]
    result = client.post("/api/account/history/import", json=payload)
    assert result.status_code == 200, result.text
    assert result.json()["imported"] == 1
    assert client.post("/api/account/history/import", json=payload).json()["imported"] == 0
    imported = db.query(Scrobble).execution_options(include_excluded=True).filter_by(is_imported=True).one()
    assert imported.xp_earned == 0 and not imported.is_playing
    assert imported.excluded_from_stats


def test_import_rejects_changed_preview_and_does_not_resurrect_deleted(client, db, owner):
    row = add_play(db, owner, when=datetime(2024, 1, 1, tzinfo=UTC), deleted_at=datetime.now(UTC))
    payload = {"scrobbles": [{"title": "Own song", "artist": "Own artist", "played_at": "2024-01-01T00:00:00Z"}]}
    preview = client.post("/api/account/history/preview", json=payload).json()
    assert preview["new"] == 0
    payload["preview_token"] = preview["preview_token"]
    payload["scrobbles"][0]["title"] = "Tampered"
    assert client.post("/api/account/history/import", json=payload).status_code == 422
    assert db.query(Scrobble).execution_options(include_deleted=True).filter_by(id=row.id).one().deleted_at


def test_csv_neutralizes_spreadsheet_formula(client, db, owner):
    add_play(db, owner, title='=HYPERLINK("https://example.org")')
    response = client.get("/api/account/history.csv")
    assert response.status_code == 200
    row = list(csv.DictReader(io.StringIO(response.text.lstrip("\ufeff"))))[0]
    assert row["title"].startswith("'=")
    filtered = client.get("/api/account/history.csv?date_from=2020-01-01&date_to=2020-01-02")
    assert list(csv.DictReader(io.StringIO(filtered.text.lstrip("\ufeff")))) == []
    assert client.get("/api/account/history.csv?date_from=2025-02-01&date_to=2025-01-01").status_code == 422


def test_search_cursor_is_owner_bound(client, db, owner):
    for index in range(32):
        add_play(db, owner, title=f"Song {index}")
    first = client.get("/api/me/library/search").json()
    second = client.get(f"/api/me/library/search?before={first['next']}").json()
    assert len(first["history"]) == 30 and len(second["history"]) == 2
    assert not ({row["id"] for row in first["history"]} & {row["id"] for row in second["history"]})


def test_artist_exclusion_is_private_and_reversible(client, db, owner):
    from app.services.recommendations import generate_smart_recommendations
    other = User(username="publicmusic", hashed_password="x", profile=UserProfile(), integration=UserIntegration())
    db.add(other)
    db.commit()
    track = add_play(db, other, artist="Excluded artist").track_id
    payload = {"value": "block_artist"}
    assert client.post(f"/api/me/recommendations/{track}/feedback", json=payload).status_code == 200
    assert client.get("/api/me/recommendations/blocked-artists").json()[0]["artist"] == "Excluded artist"
    assert all(item["artist"] != "Excluded artist" for item in generate_smart_recommendations(owner, db)["recommendations"])
    assert any(item["artist"] == "Excluded artist" for item in generate_smart_recommendations(owner, db, use_feedback=False)["recommendations"])
    assert client.post(f"/api/me/recommendations/{track}/feedback", json={"value": "reset"}).status_code == 200
    assert client.get("/api/me/recommendations/blocked-artists").json() == []


def test_returning_artist_requires_a_long_gap(client, db, owner):
    now = datetime.now(UTC)
    add_play(db, owner, when=now - timedelta(days=200))
    add_play(db, owner, when=now - timedelta(days=2))
    data = client.get("/api/me/memories").json()
    assert data["returning_artists"][0]["days_away"] == 198


def test_recent_interests_change_ranking_without_exposing_private_signals(client, db, owner):
    from app.services.recommendations import _apply_recent_interests, _select_recommendations
    tracks = [{"id": 1, "artist": "Old favorite", "genre": "Rock", "confidence_score": 0.75, "reason_type": "artist_match"},
              {"id": 2, "artist": "Recent favorite", "genre": "Jazz", "confidence_score": 0.75, "reason_type": "artist_match"}]
    _apply_recent_interests(tracks, {"Recent favorite": 7}, ["Jazz"], 100)
    selected = _select_recommendations(tracks, {"old favorite", "recent favorite"}, 50, 2)
    assert selected[0]["id"] == 2
    assert "7 раз" in selected[0]["reason"]
    assert selected[0]["confidence_score"] == 0.75


def test_export_history_is_not_materialized_before_streaming(client, db, owner, monkeypatch):
    from app.routers import account
    seen = []
    def rows(session, user_id):
        for index in range(3):
            seen.append(index)
            yield {"title": str(index)}
    monkeypatch.setattr(account, "export_history", rows)
    stream = account.stream_account_export(db.get_bind(), owner.id)
    assert next(stream).endswith('"scrobbles": [')
    assert seen == []
    assert '"title": "0"' in next(stream)
    assert seen == [0]
    stream.close()
