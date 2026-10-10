"""Granular privacy, warm-cache withdrawals and bounded invalidation."""
import json
from unittest.mock import Mock

import pytest

from app.core.security import create_session_token
from app.models import Follow, Scrobble, Track, User, UserIntegration, UserProfile
from app.services import cache
from app.services.user_preferences import preferences_dict


@pytest.fixture
def listeners(client, db):
    users = [User(username=name, hashed_password="fixture", profile=UserProfile(),
                  integration=UserIntegration()) for name in ("owner", "follower", "stranger")]
    db.add_all(users)
    db.flush()
    track = Track(title="Secret song", artist="Secret artist", genre="Rock", duration=180)
    db.add(track)
    db.flush()
    for user in users:
        db.add(Scrobble(user_id=user.id, track_id=track.id, listened_sec=180, is_playing=False, source="spotify"))
    db.add(Follow(follower_id=users[1].id, following_id=users[0].id))
    db.commit()
    return users


def auth(client, user):
    client.cookies.clear()
    client.headers.pop("X-API-Key", None)
    if user:
        client.headers["X-API-Key"] = create_session_token(str(user.id), str(user.hashed_password), int(user.session_version))
    client.headers["Origin"] = "http://localhost:3000"


def privacy(db, user, section, visibility):
    data = preferences_dict(user.profile)
    data["privacy"][section] = visibility
    user.profile.preferences = json.dumps(data)
    db.commit()


@pytest.mark.parametrize("visibility", ["private", "followers"])
@pytest.mark.parametrize("endpoint", ["/api/global-history", "/api/feed/global"])
def test_global_feeds_hide_restricted_history_even_for_owner(client, db, listeners, endpoint, visibility):
    auth(client, listeners[0])
    privacy(db, listeners[0], "history", visibility)
    payload = client.get(endpoint).json()
    items = payload["feed"] if isinstance(payload, dict) else payload
    assert "owner" not in [item["username"] for item in items]


@pytest.mark.parametrize("visibility,visible", [("all", True), ("followers", True), ("private", False)])
def test_following_feed_honors_history(client, db, listeners, visibility, visible):
    auth(client, listeners[1])
    privacy(db, listeners[0], "history", visibility)
    items = client.get("/api/friends-history/follower").json()
    assert ("owner" in [item["username"] for item in items]) == visible


def test_warm_feed_rechecks_privacy_and_bans_without_invalidation(client, db, listeners):
    assert any(item["username"] == "owner" for item in client.get("/api/global-history").json())
    privacy(db, listeners[0], "history", "private")
    listeners[1].is_banned = True
    db.commit()
    assert [item["username"] for item in client.get("/api/global-history").json()] == ["stranger"]
    assert [item["username"] for item in client.get("/api/feed/global").json()["feed"]] == ["stranger"]


STAT_ENDPOINTS = [
    "/api/user/mood?username=owner", "/api/recommendations?username=owner",
    "/api/discovery/taste-twins?username=owner", "/api/user/stranger/compatibility/owner",
    "/api/recommendations/user/owner", "/api/search/taste?my_username=owner",
]


@pytest.mark.parametrize("endpoint", STAT_ENDPOINTS)
@pytest.mark.parametrize("visibility", ["private", "followers"])
def test_statistics_are_hidden_from_strangers(client, db, listeners, endpoint, visibility):
    privacy(db, listeners[0], "statistics", visibility)
    auth(client, listeners[2])
    assert client.get(endpoint).status_code == 403


@pytest.mark.parametrize("viewer_index,visibility,visible", [
    (0, "private", True), (1, "followers", True), (1, "private", False),
    (2, "followers", False), (None, "followers", False),
])
def test_taste_match_respects_authenticated_requester(client, db, listeners, viewer_index, visibility, visible):
    privacy(db, listeners[0], "statistics", visibility)
    auth(client, listeners[viewer_index] if viewer_index is not None else None)
    data = client.get("/api/taste-match/stranger/owner").json()
    assert bool(data["common_artists"]) == visible


def test_twin_and_search_candidates_exclude_hidden_statistics(client, db, listeners):
    auth(client, listeners[2])
    assert any(item["username"] == "owner" for item in client.get("/api/discovery/taste-twins?username=stranger").json())
    privacy(db, listeners[0], "statistics", "private")
    twins = client.get("/api/discovery/taste-twins?username=stranger").json()
    search = client.get("/api/search/taste?my_username=stranger").json()
    assert all(item["username"] != "owner" for item in twins + search)


def test_cached_preview_withdraws_statistics_immediately(client, db, listeners):
    assert client.get("/api/preview/user/owner").json()["top_artist"] == "Secret artist"
    privacy(db, listeners[0], "statistics", "private")
    payload = client.get("/api/preview/user/owner").json()
    assert payload["top_artist"] is None
    assert payload["scrobbles"] is None
    listeners[0].profile.is_private = True
    db.commit()
    assert client.get("/api/preview/user/owner").json()["bio"] is None


def test_hidden_history_cannot_be_probed_via_like(client, db, listeners):
    auth(client, listeners[2])
    privacy(db, listeners[0], "history", "private")
    row = db.query(Scrobble).filter_by(user_id=listeners[0].id).one()
    assert client.post(f"/api/scrobble/{row.id}/like").status_code == 403
    assert client.post(f"/api/scrobble/{row.id}/comment", json={"content": "test"}).status_code == 403


def test_invalidation_throttle_local_and_redis(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(cache.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(cache, "_last_invalidation", float("-inf"))
    monkeypatch.setattr(cache, "redis_client", None)
    flush = Mock(return_value=4)
    monkeypatch.setattr(cache, "clear_all", flush)
    assert cache.invalidate_all() == 4
    assert cache.invalidate_all() == 0
    clock[0] += 5
    assert cache.invalidate_all() == 4
    flush.assert_called_with()
    assert flush.call_count == 2
    shared = Mock()
    shared.set.return_value = False
    monkeypatch.setattr(cache, "redis_client", shared)
    clock[0] += 5
    assert cache.invalidate_all() == 0
    shared.set.assert_called_once_with("cache_invalidation_lease", "1", nx=True, ex=5)
    assert flush.call_count == 2


@pytest.mark.parametrize("period", ["all", "7d", "30d"])
def test_scoped_rankings_preserve_owner_and_follower_access(client, db, listeners, period):
    privacy(db, listeners[0], "statistics", "followers")
    public = client.get(f"/api/leaderboard?period={period}").json()
    assert all(item["username"] != "owner" for item in public)
    auth(client, listeners[1])
    followed = client.get(f"/api/leaderboard/following?period={period}").json()
    assert any(item["username"] == "owner" for item in followed)
    privacy(db, listeners[0], "statistics", "private")
    assert all(item["username"] != "owner" for item in client.get(f"/api/leaderboard/following?period={period}").json())
    auth(client, listeners[0])
    assert client.get(f"/api/leaderboard/me?period={period}").json()["rank"] is not None
    listeners[0].profile.is_private = True
    db.commit()
    assert client.get(f"/api/leaderboard/me?period={period}").json()["rank"] is not None


def test_sitemap_withdraws_cached_profile_without_global_flush(client, db, listeners):
    first = client.get("/api/preview/sitemap").json()
    assert any(item["username"] == "owner" for item in first["users"])
    data = preferences_dict(listeners[0].profile)
    data["privacy"]["search_indexing"] = False
    listeners[0].profile.preferences = json.dumps(data)
    db.commit()
    assert all(item["username"] != "owner" for item in client.get("/api/preview/sitemap").json()["users"])
    listeners[1].profile.is_private = True
    db.commit()
    assert all(item["username"] != "follower" for item in client.get("/api/preview/sitemap").json()["users"])


@pytest.mark.parametrize("endpoint", ["/api/global-history", "/api/feed/global"])
def test_hidden_rows_do_not_crowd_out_public_feed(client, db, listeners, endpoint):
    privacy(db, listeners[0], "history", "private")
    track = db.query(Track).one()
    for _ in range(25):
        db.add(Scrobble(user_id=listeners[0].id, track_id=track.id, listened_sec=180, is_playing=False, source="spotify"))
    db.commit()
    payload = client.get(endpoint).json()
    items = payload["feed"] if isinstance(payload, dict) else payload
    assert {item["username"] for item in items} == {"follower", "stranger"}


def test_hidden_candidates_do_not_crowd_out_taste_search(client, db, listeners):
    track = db.query(Track).one()
    for index in range(55):
        db.add(User(username=f"hidden{index}", hashed_password="fixture", profile=UserProfile(
            preferences=json.dumps({"privacy": {"statistics": "private"}}))))
    late = User(username="late_public_match", hashed_password="fixture", profile=UserProfile(), integration=UserIntegration())
    db.add(late)
    db.flush()
    db.add(Scrobble(user_id=late.id, track_id=track.id, listened_sec=180, is_playing=False, source="spotify"))
    db.commit()
    auth(client, listeners[2])
    results = client.get("/api/search/taste?my_username=stranger").json()
    assert any(item["username"] == "late_public_match" for item in results)
