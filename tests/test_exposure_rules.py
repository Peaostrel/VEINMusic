"""Widgets, comments and device pairing show only what the owner made public."""
import hashlib
import json
from datetime import UTC, datetime, timedelta

import pytest
from starlette.requests import Request

from app.database import SessionLocal
from app.models import DeviceAuthorization, Scrobble, ScrobbleComment, Track, User, UserIntegration, UserProfile


def _user(db, username, privacy=None, banned=False):
    user = User(username=username, hashed_password="x", is_banned=banned)
    prefs = {"privacy": privacy} if privacy else {}
    user.profile = UserProfile(preferences=json.dumps(prefs))
    user.integration = UserIntegration()
    db.add(user)
    db.commit()
    return user


def _play(db, user, title, playing=False, deleted=False, minutes_ago=0):
    track = Track(title=title, artist=f"{title} Band", duration=100)
    db.add(track)
    db.commit()
    when = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    scrobble = Scrobble(user_id=user.id, track_id=track.id, listened_sec=100, is_playing=playing,
                        source="test", played_at=when, updated_at=when,
                        deleted_at=datetime.now(UTC) if deleted else None)
    db.add(scrobble)
    db.commit()
    return scrobble


def _now_playing(client, username):
    response = client.get(f"/api/widgets/now-playing/{username}.svg")
    assert response.status_code == 200
    return response.text


def test_now_playing_widget_shows_current_track_only_when_public(client, db):
    user = _user(db, "widget_current", privacy={"history": "private"})
    _play(db, user, "OlderSong", minutes_ago=10)
    _play(db, user, "LiveSong", playing=True)
    svg = _now_playing(client, "widget_current")
    assert "LiveSong" in svg and "LISTENING NOW" in svg
    assert "OlderSong" not in svg


def test_now_playing_widget_hides_current_track_when_private(client, db):
    user = _user(db, "widget_hidden_now", privacy={"current_track": "private"})
    _play(db, user, "OlderSong", minutes_ago=10)
    _play(db, user, "LiveSong", playing=True)
    svg = _now_playing(client, "widget_hidden_now")
    assert "LiveSong" not in svg
    assert "OlderSong" in svg and "LAST PLAYED" in svg


def test_now_playing_widget_hides_everything_when_both_private(client, db):
    user = _user(db, "widget_all_hidden", privacy={"current_track": "private", "history": "followers"})
    _play(db, user, "LiveSong", playing=True)
    svg = _now_playing(client, "widget_all_hidden")
    assert "LiveSong" not in svg
    assert "Listening is hidden" in svg


def test_now_playing_widget_skips_deleted_plays_and_banned_users(client, db):
    user = _user(db, "widget_deleted")
    _play(db, user, "KeptSong", minutes_ago=10)
    _play(db, user, "DeletedSong", deleted=True)
    svg = _now_playing(client, "widget_deleted")
    assert "DeletedSong" not in svg and "KeptSong" in svg

    banned = _user(db, "widget_banned", banned=True)
    _play(db, banned, "BannedSong")
    assert "BannedSong" not in _now_playing(client, "widget_banned")


@pytest.mark.parametrize("path", ["/api/widgets/top-artists/{}.svg", "/api/widgets/og/recap/{}.svg"])
def test_statistics_widgets_respect_statistics_privacy(client, db, path):
    user = _user(db, "widget_stats", privacy={"statistics": "followers"})
    _play(db, user, "SecretSong")
    assert "SecretSong Band" not in client.get(path.format("widget_stats")).text

    open_user = _user(db, "widget_stats_open")
    _play(db, open_user, "OpenSong")
    _play(db, open_user, "GoneSong", deleted=True)
    text = client.get(path.format("widget_stats_open")).text
    assert "OpenSong Band" in text
    assert "GoneSong Band" not in text


def test_widgets_do_not_echo_long_names(client):
    svg = _now_playing(client, "x" * 500)
    assert "x" * 33 not in svg


def test_comments_follow_history_visibility(client, db):
    owner = _user(db, "comments_owner", privacy={"history": "followers"})
    scrobble = _play(db, owner, "Commented")
    db.add(ScrobbleComment(user_id=owner.id, scrobble_id=scrobble.id, content="secret note"))
    db.commit()
    response = client.get(f"/api/scrobble/{scrobble.id}/comments")
    assert response.status_code == 403

    open_owner = _user(db, "comments_open")
    gone = _play(db, open_owner, "Removed", deleted=True)
    assert client.get(f"/api/scrobble/{gone.id}/comments").status_code == 404


def _device(db, status="approved", user=None):
    code = "device-code-race"
    auth = DeviceAuthorization(
        device_code_hash=hashlib.sha256(code.encode()).hexdigest(), user_code="ABCD-EFGH",
        client_name="Race", status=status, user_id=user.id if user else None,
        expires_at=datetime.now(UTC) + timedelta(minutes=5))
    db.add(auth)
    db.commit()
    return code, auth


def test_device_key_is_issued_once_even_for_racing_polls(client, db):
    from app.models import ApiKey
    from app.routers.devices import DeviceTokenRequest, poll_device_token

    owner = _user(db, "device_race")
    code, auth = _device(db, user=owner)
    assert auth.status == "approved"  # loaded in this session
    # Another poll wins the race and consumes the approval meanwhile
    other = SessionLocal()
    other.query(DeviceAuthorization).filter_by(id=auth.id).update({"status": "consumed"})
    other.commit()
    other.close()

    request = Request({"type": "http", "method": "POST", "path": "/api/devices/token",
                       "headers": [], "query_string": b"", "client": ("1.1.1.1", 1)})
    # This session still sees the stale "approved" row
    result = poll_device_token(request, DeviceTokenRequest(device_code=code), db)
    assert result == {"status": "invalid"}
    assert db.query(ApiKey).filter(ApiKey.user_id == owner.id).count() == 0


def test_device_code_is_decided_once(client, db):
    response = client.post("/auth/register", json={"username": "device_judge", "password": "device-judge-pass"})
    assert response.status_code == 200
    _device(db, status="pending")
    origin = {"Origin": "http://localhost:3000"}
    first = client.post("/api/devices/approve", json={"user_code": "ABCD-EFGH", "approve": False}, headers=origin)
    assert first.json() == {"status": "denied"}
    second = client.post("/api/devices/approve", json={"user_code": "ABCD-EFGH"}, headers=origin)
    assert second.status_code == 404
