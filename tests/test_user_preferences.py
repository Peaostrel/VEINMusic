"""User settings persistence and the server-side behaviour they control."""

import asyncio
from datetime import UTC, datetime, timedelta

from app.models import Follow, Notification, Scrobble, Track, User
from app.services import notifications, scrobble_processor
from app.services.cache import clear_all
from app.services.user_preferences import get_preferences, save_preferences
from app.services.recap_notifications import create_due_recap_notifications


def _register(client, username: str) -> str:
    response = client.post(
        "/auth/register",
        json={"username": username, "password": "test-password-123"},
    )
    assert response.status_code == 200
    return client.cookies.get("api_key")


def _preferences(client, token: str) -> dict:
    response = client.get(
        "/api/profile/preferences", headers={"X-API-Key": token}
    )
    assert response.status_code == 200
    return response.json()


def _save_preferences(client, token: str, data: dict):
    return client.put(
        "/api/profile/preferences",
        headers={"X-API-Key": token},
        json=data,
    )


def test_preferences_defaults_persist_and_clean_lists(client, db):
    token = _register(client, "settings_owner")
    data = _preferences(client, token)
    assert data["version"] == 1
    assert data["appearance"]["color_mode"] == "dark"

    data["appearance"]["color_mode"] = "system"
    data["privacy"]["history"] = "followers"
    data["listening"]["ignored_artists"] = ["  Artist  ", "artist", ""]
    response = _save_preferences(client, token, data)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["appearance"]["color_mode"] == "system"
    assert saved["privacy"]["history"] == "followers"
    assert saved["listening"]["ignored_artists"] == ["Artist"]

    db.expire_all()
    profile = db.query(User).filter_by(username="settings_owner").one().profile
    assert get_preferences(profile).appearance.color_mode == "system"


def test_preferences_reject_unknown_or_duplicate_sections(client):
    token = _register(client, "invalid_settings")
    data = _preferences(client, token)
    data["unexpected"] = True
    assert _save_preferences(client, token, data).status_code == 422

    data = _preferences(client, token)
    data["profile"]["section_order"][1] = data["profile"]["section_order"][0]
    assert _save_preferences(client, token, data).status_code == 422


def test_granular_privacy_is_enforced_by_api(client, db):
    owner_token = _register(client, "granular_owner")
    follower_token = _register(client, "granular_follower")
    stranger_token = _register(client, "granular_stranger")

    owner = db.query(User).filter_by(username="granular_owner").one()
    follower = db.query(User).filter_by(username="granular_follower").one()
    owner.profile.favorite_artist = "Visible to followers"
    owner.profile.location = "Secret city"
    db.add(Follow(follower_id=follower.id, following_id=owner.id))
    track = Track(title="Privacy song", artist="Privacy artist", duration=100)
    db.add(track)
    db.flush()
    db.add(
        Scrobble(
            user_id=owner.id,
            track_id=track.id,
            source="spotify",
            played_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            listened_sec=100,
            is_playing=False,
        )
    )
    db.commit()

    data = _preferences(client, owner_token)
    data["privacy"].update(
        {
            "history": "followers",
            "statistics": "private",
            "showcase": "followers",
            "location": "private",
        }
    )
    assert _save_preferences(client, owner_token, data).status_code == 200

    assert client.get(
        "/api/history/granular_owner", headers={"X-API-Key": follower_token}
    ).status_code == 200
    assert client.get(
        "/api/history/granular_owner", headers={"X-API-Key": stranger_token}
    ).status_code == 403
    assert client.get(
        "/api/stats/granular_owner", headers={"X-API-Key": follower_token}
    ).status_code == 403
    assert client.get(
        "/api/stats/granular_owner", headers={"X-API-Key": owner_token}
    ).status_code == 200

    follower_view = client.get(
        "/api/user/granular_owner", headers={"X-API-Key": follower_token}
    ).json()
    stranger_view = client.get(
        "/api/user/granular_owner", headers={"X-API-Key": stranger_token}
    ).json()
    assert follower_view["favorite_artist"] == "Visible to followers"
    assert follower_view["location"] is None
    assert stranger_view["favorite_artist"] is None


def test_feed_sharing_hides_existing_scrobbles(client, db):
    token = _register(client, "quiet_feed")
    user = db.query(User).filter_by(username="quiet_feed").one()
    track = Track(title="Hidden song", artist="Hidden artist", duration=100)
    db.add(track)
    db.flush()
    db.add(
        Scrobble(
            user_id=user.id,
            track_id=track.id,
            source="yandex",
            played_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            listened_sec=100,
            is_playing=False,
        )
    )
    db.commit()
    clear_all()
    assert any(
        item["username"] == "quiet_feed"
        for item in client.get("/api/global-history").json()
    )

    data = _preferences(client, token)
    data["feed"]["share_scrobbles"] = False
    assert _save_preferences(client, token, data).status_code == 200
    assert not any(
        item["username"] == "quiet_feed"
        for item in client.get("/api/global-history").json()
    )


def test_listening_filters_and_private_session_skip_storage(client, db):
    _register(client, "filtered_listener")
    user = db.query(User).filter_by(username="filtered_listener").one()

    preferences = get_preferences(user.profile)
    preferences.listening.ignored_artists = ["Ignored artist"]
    save_preferences(user.profile, preferences)
    db.commit()
    status = asyncio.run(
        scrobble_processor.process_scrobble(
            db,
            user,
            "Song",
            "Ignored artist",
            "",
            "",
            "desktop",
            0,
            True,
            180,
        )
    )
    assert status == "artist_ignored"
    assert db.query(Scrobble).count() == 0

    preferences = get_preferences(user.profile)
    preferences.listening.ignored_artists = []
    preferences.listening.private_session_until = datetime.now(UTC) + timedelta(hours=1)
    save_preferences(user.profile, preferences)
    db.commit()
    status = asyncio.run(
        scrobble_processor.process_scrobble(
            db,
            user,
            "Private song",
            "Artist",
            "",
            "",
            "desktop",
            0,
            True,
            180,
        )
    )
    assert status == "private_session"
    assert db.query(Scrobble).count() == 0


def test_current_track_privacy_hides_live_rows(client, db):
    token = _register(client, "hidden_now_playing")
    user = db.query(User).filter_by(username="hidden_now_playing").one()
    track = Track(title="Playing secretly", artist="Artist", duration=180)
    db.add(track)
    db.flush()
    db.add(
        Scrobble(
            user_id=user.id,
            track_id=track.id,
            source="spotify",
            played_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            listened_sec=30,
            is_playing=True,
        )
    )
    db.commit()

    data = _preferences(client, token)
    data["privacy"]["current_track"] = "private"
    assert _save_preferences(client, token, data).status_code == 200
    client.cookies.clear()

    assert client.get("/api/current-track/hidden_now_playing").json() == {
        "playing": False
    }
    assert client.get("/api/history/hidden_now_playing").json()["history"] == []
    assert not any(
        item["username"] == "hidden_now_playing"
        for item in client.get("/api/global-history").json()
    )


def test_notification_channels_control_storage_and_in_app_list(client, db):
    _register(client, "notification_actor")
    _register(client, "notification_recipient")
    actor = db.query(User).filter_by(username="notification_actor").one()
    recipient = db.query(User).filter_by(username="notification_recipient").one()

    preferences = get_preferences(recipient.profile)
    preferences.notifications.in_app.likes = False
    preferences.notifications.push.likes = True
    save_preferences(recipient.profile, preferences)
    db.commit()
    note = notifications.create(
        db,
        recipient_id=recipient.id,
        actor_id=actor.id,
        kind=notifications.KIND_LIKE,
    )
    db.commit()
    assert note is not None
    assert notifications.list_for_user(db, recipient.id) == {
        "items": [],
        "unread": 0,
    }

    preferences.notifications.in_app.comments = False
    preferences.notifications.push.comments = False
    save_preferences(recipient.profile, preferences)
    db.commit()
    assert notifications.create(
        db,
        recipient_id=recipient.id,
        actor_id=actor.id,
        kind=notifications.KIND_COMMENT,
    ) is None


def test_recap_reminders_are_due_once_in_user_local_time(client, db):
    _register(client, "recap_listener")
    user = db.query(User).filter_by(username="recap_listener").one()
    preferences = get_preferences(user.profile)
    preferences.wrapped.auto_weekly = True
    preferences.wrapped.auto_monthly = True
    save_preferences(user.profile, preferences)
    db.commit()

    # Default timezone is UTC+3: 06:00 UTC is 09:00 locally. 1 June 2026
    # is both a Monday and the first day of a month.
    now = datetime(2026, 6, 1, 6, tzinfo=UTC)
    assert len(create_due_recap_notifications(now)) == 2
    assert create_due_recap_notifications(now) == []
    db.expire_all()
    notes = db.query(Notification).filter_by(
        user_id=user.id, kind=notifications.KIND_RECAP
    ).all()
    assert len(notes) == 2
