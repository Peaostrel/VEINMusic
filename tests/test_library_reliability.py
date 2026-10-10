"""Cross-source credit, bounded paging, undo, saved music and session revocation."""
from datetime import UTC, datetime, timedelta
from collections import Counter
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace

import pytest
from app.core.security import create_session_token, get_password_hash
from app.models import HistoryChange, Notification, Scrobble, Track, User, UserIntegration, UserProfile
from app.services.operational_monitor import evaluate, purge_expired
from app.services.scrobble_processor import _record_scrobble
from app.services.listen_status import listen_status


@pytest.fixture
def people(client, db):
    users = [User(username=name, hashed_password=get_password_hash("feature-pass"), profile=UserProfile(), integration=UserIntegration()) for name in ("alice", "bob")]
    db.add_all(users); db.commit()
    client.headers["Origin"] = "http://localhost:3000"
    client.cookies.set("api_key", create_session_token(str(users[0].id), str(users[0].hashed_password)))
    return users


def listen(db, user, title="Song", artist="Band", seconds=180, when=None):
    track = db.query(Track).filter_by(title=title, artist=artist).first()
    if not track:
        track = Track(title=title, artist=artist, duration=180, genre="Rock")
        db.add(track); db.flush()
    row = Scrobble(user_id=user.id, track_id=track.id, source="yandex", listened_sec=seconds,
                   is_playing=False, played_at=when or datetime.now(UTC))
    db.add(row); db.commit()
    return row


def test_sources_confirm_without_double_credit_and_primary_loop(db, client, people):
    row = listen(db, people[0], seconds=160)
    row.is_playing = True; row.credit_source = "yandex:live"; db.commit()
    result = _record_scrobble(db, people[0], row.track, "yandex", 0, True, 20, collector="client")
    assert result["status"] == "confirmed_duplicate"
    assert db.query(Scrobble).count() == 1
    assert row.listened_sec == 160
    assert len(row.confirmed_sources) == 2
    result = _record_scrobble(db, people[0], row.track, "yandex", 0, True, collector="live")
    assert result["new_item"] is not None
    assert db.query(Scrobble).count() == 2


def test_stale_primary_can_hand_over(db, client, people):
    row = listen(db, people[0], seconds=80)
    row.updated_at = datetime.now(UTC) - timedelta(seconds=45); row.credit_source = "yandex:live"; db.commit()
    result = _record_scrobble(db, people[0], row.track, "yandex", 90, True, collector="client")
    assert result["status"] == "ok" and db.query(Scrobble).count() == 1
    assert row.credit_source == "yandex:client"


@pytest.mark.parametrize("action", ["exclude", "restore", "delete", "edit"])
def test_bulk_ownership_atomic_undo(client, db, people, action):
    a = listen(db, people[0]); b = listen(db, people[1], title="Other")
    data = {"ids": [a.id, b.id], "action": action, "artist": "Changed"}
    assert client.post("/api/me/history/apply", json=data).status_code == 404
    assert a.track.artist == "Band" and not a.excluded_from_stats
    data["ids"] = [a.id]
    assert client.post("/api/me/history/preview", json=data).json()["count"] == 1
    result = client.post("/api/me/history/apply", json=data)
    assert result.status_code == 200, result.text
    undo_id = result.json()["undo_id"]
    if action == "delete":
        assert client.get("/api/me/history").json()["items"] == []
        assert db.query(Scrobble).execution_options(include_excluded=True).filter_by(id=a.id).first() is None
    assert client.post(f"/api/me/history/undo/{undo_id}").status_code == 200
    db.expire_all()
    assert a.track.artist == "Band" and not a.excluded_from_stats and a.deleted_at is None
    assert client.post(f"/api/me/history/undo/{undo_id}").status_code == 409


def test_undo_cannot_overwrite_new_changes_or_expire(client, db, people):
    row = listen(db, people[0])
    result = client.post("/api/me/history/apply", json={"ids": [row.id], "action": "edit", "artist": "Edited"}).json()
    client.patch(f"/api/me/scrobbles/{row.id}/metadata", json={"title": "Different", "artist": "Band"})
    assert client.post(f"/api/me/history/undo/{result['undo_id']}").status_code == 409
    change = db.get(HistoryChange, result["undo_id"]); change.expires_at = datetime.now(UTC) - timedelta(seconds=1); db.commit()
    assert client.post(f"/api/me/history/undo/{result['undo_id']}").status_code == 409


def test_cursor_identical_timestamps_filters_and_status(client, db, people):
    stamp = datetime.now(UTC)
    rows = [listen(db, people[0], title=f"Song {i}", seconds=10 if i % 2 else 180, when=stamp) for i in range(6)]
    page = client.get("/api/me/history?limit=2").json()
    ids = [item["id"] for item in page["items"]]
    while page["next_cursor"]:
        page = client.get("/api/me/history", params={"limit": 2, "cursor": page["next_cursor"]}).json()
        ids += [item["id"] for item in page["items"]]
    assert ids == sorted([row.id for row in rows], reverse=True)
    assert len(client.get("/api/me/history?status=counted").json()["items"]) == 3
    assert client.get("/api/me/history?cursor=garbage").status_code == 422
    assert client.get("/api/me/history?source=other").json()["items"] == []
    assert listen_status(rows[1], rows[1].track)["code"] == "too_short"


def test_deleted_rows_purge_only_after_undo_window(client, db, people):
    row = listen(db, people[0]); client.post("/api/me/history/apply", json={"ids": [row.id], "action": "delete"})
    purge_expired(db)
    assert db.query(Scrobble).execution_options(include_deleted=True, include_excluded=True).filter_by(id=row.id).first()
    row.deleted_at = datetime.now(UTC) - timedelta(hours=25); db.commit(); row_id = row.id
    purge_expired(db)
    assert db.query(Scrobble).execution_options(include_deleted=True, include_excluded=True).filter_by(id=row_id).first() is None


def test_saved_music_private_notes_and_played_signal(client, db, people):
    row = listen(db, people[1])
    assert client.put(f"/api/me/listen-later/{row.track_id}", json={"note": "Personal"}).status_code == 200
    saved = client.get("/api/me/listen-later").json()["items"]
    assert saved[0]["note"] == "Personal" and not saved[0]["heard"]
    listen(db, people[0])
    assert client.get("/api/me/listen-later").json()["items"][0]["heard"]
    export = client.get("/api/account/export").json()
    assert export["listen_later"][0]["note"] == "Personal"
    client.cookies.set("api_key", create_session_token(str(people[1].id), str(people[1].hashed_password)))
    assert client.get("/api/me/listen-later").json()["items"] == []
    client.delete(f"/api/me/listen-later/{row.track_id}")
    client.cookies.set("api_key", create_session_token(str(people[0].id), str(people[0].hashed_password)))
    assert len(client.get("/api/me/listen-later").json()["items"]) == 1


def test_recommendation_diversity_and_recent_history(client, db, people):
    listen(db, people[0], title="Known", artist="Familiar")
    for artist in ("Familiar", "New One", "New Two"):
        for i in range(4):
            listen(db, people[1], title=f"{artist} {i}", artist=artist)
    recs = client.get("/api/recommendations/me?novelty=100").json()["recommendations"]
    assert recs and max(Counter(item["artist"] for item in recs).values()) <= 2
    assert recs[0]["artist"] != "Familiar"
    ids = [item["id"] for item in recs]
    client.post("/api/me/recommendations/impressions", json={"ids": ids})
    assert len(client.get("/api/me/recommendations/history").json()["items"]) == len(ids)
    fresh = client.get("/api/recommendations/me?avoid_recent=true").json()["recommendations"]
    assert not (set(ids) & {item["id"] for item in fresh})
    assert client.get("/api/recommendations/me?novelty=101").status_code == 422


def test_individual_session_revoke_does_not_logout_other_device(client, db, people):
    client.cookies.clear()
    payload = {"username": "alice", "password": "feature-pass"}
    assert client.post("/auth/login", json=payload).status_code == 200
    first = client.cookies.get("api_key"); first_id = first.split(":")[2]
    assert client.post("/auth/login", json=payload).status_code == 200
    second = client.cookies.get("api_key")
    sessions = client.get("/api/account/sessions").json()["items"]
    assert len(sessions) == 2 and sum(item["current"] for item in sessions) == 1
    assert first != second
    assert client.delete(f"/api/account/sessions/{first_id}").status_code == 200
    assert client.get("/api/account/sessions").status_code == 200
    client.cookies.set("api_key", first)
    assert client.get("/api/account/sessions").status_code == 401
    client.cookies.set("api_key", second)
    assert client.post("/auth/logout").status_code == 200
    client.cookies.set("api_key", second)
    assert client.get("/api/account/sessions").status_code == 401
    assert db.query(Notification).filter_by(kind="security").count() == 2


def test_monitor_checks_outages_and_does_not_treat_idle_listening_as_failure():
    good = {"worker": {"redis": True, "queued_jobs": 0}, "poll_age_minutes": 0.5,
            "backups": {"latest": {"age_hours": 1}}, "offsite": {"configured": False, "age_hours": None}, "disk_used_percent": 50}
    assert evaluate(good) == []
    bad = {**good, "worker": {"redis": False, "queued_jobs": 501}, "poll_age_minutes": 4,
           "backups": {"latest": None}, "offsite": {"configured": True, "age_hours": 40}, "disk_used_percent": 91, "source_errors": ["spotify"]}
    assert {item["code"] for item in evaluate(bad)} == {"redis", "queue", "cloud_poll", "backup", "offsite", "disk", "source:spotify"}


def test_hidden_catalog_cannot_be_saved_by_guessing_ids(client, db, people):
    row = listen(db, people[1])
    from app.services.user_preferences import get_preferences, save_preferences
    prefs = get_preferences(people[1].profile)
    prefs.privacy.history = "private"
    prefs.privacy.statistics = "private"
    save_preferences(people[1].profile, prefs)
    db.commit()
    assert client.put(f"/api/me/listen-later/{row.track_id}", json={}).status_code == 404
    assert client.post("/api/me/recommendations/impressions", json={"ids": [row.track_id]}).json()["recorded"] == 0


def test_revoked_session_cannot_reuse_websocket_ticket(client, db, people):
    client.cookies.clear()
    client.post("/auth/login", json={"username": "alice", "password": "feature-pass"})
    token = client.cookies.get("api_key")
    ticket = client.post("/auth/ws-ticket").json()["ticket"]
    from app.main import _get_ticket_username
    assert _get_ticket_username(ticket, db) == "alice"
    client.delete(f"/api/account/sessions/{token.split(':')[2]}")
    assert _get_ticket_username(ticket, db) is None


def test_revocation_closes_only_matching_sockets():
    import asyncio
    from app.core.websockets import ConnectionManager
    manager = ConnectionManager()
    first = SimpleNamespace(state=SimpleNamespace(session_id="first"), close=AsyncMock())
    second = SimpleNamespace(state=SimpleNamespace(session_id="second"), close=AsyncMock())
    manager.active_connections["alice"] = [first, second]
    asyncio.run(manager._deliver({"kind": "session_revoke", "key": "alice", "session_id": "first"}))
    first.close.assert_awaited_once_with(code=1008)
    second.close.assert_not_awaited()


@pytest.mark.parametrize("duration", [0, None])
def test_unknown_duration_filters_and_saved_heard_use_same_threshold(client, db, people, duration):
    row = listen(db, people[0], seconds=0)
    row.track.duration = duration
    db.commit()
    assert client.get("/api/me/history?status=counted").json()["items"] == []
    incomplete = client.get("/api/me/history?status=incomplete").json()["items"]
    assert [item["id"] for item in incomplete] == [row.id]
    assert client.put(f"/api/me/listen-later/{row.track_id}", json={}).status_code == 200
    row.played_at = datetime.now(UTC) + timedelta(seconds=1)
    db.commit()
    assert not client.get("/api/me/listen-later").json()["items"][0]["heard"]
    row.listened_sec = 153
    db.commit()
    assert client.get("/api/me/listen-later").json()["items"][0]["heard"]
    assert len(client.get("/api/me/history?status=counted").json()["items"]) == 1


def test_raw_taste_queries_hide_deleted_rows_even_without_exclusion(client, db, people):
    from app.services.taste import get_taste_match_internal
    row = listen(db, people[0])
    listen(db, people[1])
    assert get_taste_match_internal("alice", "bob", db)["common_artists"] == ["Band"]
    row.deleted_at = datetime.now(UTC)
    row.excluded_from_stats = False
    db.commit()
    assert get_taste_match_internal("alice", "bob", db)["common_artists"] == []
    assert client.get("/api/taste-match/alice/bob").json()["common_artists"] == []


def test_repeated_impression_moves_to_front_and_timestamp_cursor_pages(client, db, people):
    from app.models import RecommendationImpression
    tracks = [listen(db, people[0], title=f"Impression {i}").track_id for i in range(55)]
    stamp = datetime.now(UTC) - timedelta(days=1)
    db.add_all([RecommendationImpression(user_id=people[0].id, track_id=track_id, shown_at=stamp) for track_id in tracks])
    db.commit()
    client.post("/api/me/recommendations/impressions", json={"ids": [tracks[0]]})
    first = client.get("/api/me/recommendations/history").json()
    assert first["items"][0]["track"]["id"] == tracks[0]
    second = client.get("/api/me/recommendations/history", params={"before": first["next_cursor"]}).json()
    ids = [item["id"] for item in first["items"] + second["items"]]
    assert len(ids) == len(set(ids)) == 55
    assert second["next_cursor"] is None
    assert client.get("/api/me/recommendations/history?before=bad").status_code == 422


def test_every_room_tab_receives_events_and_is_revoked_without_removing_other_tab():
    import asyncio
    from app.core.websockets import ConnectionManager

    async def scenario():
        manager = ConnectionManager()
        manager._redis_down_until = float("inf")
        sockets = [SimpleNamespace(state=SimpleNamespace(session_id=session), close=AsyncMock(), send_json=AsyncMock())
                   for session in ("first", "first", "second")]
        for socket in sockets:
            await manager.join_room("room", "alice", socket)
        await manager.broadcast_to_room("room", {"type": "example"})
        for socket in sockets:
            socket.send_json.assert_awaited_once()
        await manager._deliver({"kind": "session_revoke", "key": "alice", "session_id": "first"})
        sockets[0].close.assert_awaited_once_with(code=1008)
        sockets[1].close.assert_awaited_once_with(code=1008)
        sockets[2].close.assert_not_awaited()
        await manager.leave_room("room", "alice", sockets[0])
        await manager.leave_room("room", "alice", sockets[1])
        assert (await manager.room_state("room"))["listeners"] == ["alice"]
        await manager.leave_room("room", "alice", sockets[2])
        assert await manager.room_state("room") is None

    asyncio.run(scenario())
