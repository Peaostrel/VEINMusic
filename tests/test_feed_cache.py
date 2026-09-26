"""Caching of the home page endpoints (global feed, taste twins)."""
from unittest.mock import patch

from app.database import SessionLocal
from app.models import Scrobble, Track, User

ORIGIN = {"Origin": "http://localhost:3000"}


def _register(client, username):
    client.post("/auth/register", json={"username": username, "password": "password"})


def _scrobble(username, title):
    s = SessionLocal()
    try:
        user = s.query(User).filter(User.username == username).one()
        track = Track(title=title, artist="Band", duration=200)
        s.add(track)
        s.flush()
        s.add(Scrobble(user_id=user.id, track_id=track.id, source="yandex",
                       is_playing=False, listened_sec=200))
        s.commit()
        return s.query(Scrobble.id).filter(Scrobble.track_id == track.id).scalar()
    finally:
        s.close()


def test_global_feed_is_cached_and_refreshed_on_like(client):
    client.headers.update(ORIGIN)
    _register(client, "feeder")
    scrobble_id = _scrobble("feeder", "First")
    first = client.get("/api/global-history").json()
    assert [i["title"] for i in first] == ["First"]

    _scrobble("feeder", "Second")
    # Served from the cache for a few seconds
    assert client.get("/api/global-history").json() == first

    # A like changes the counters, so the cache is dropped
    client.post(f"/api/scrobble/{scrobble_id}/like")
    titles = [i["title"] for i in client.get("/api/global-history").json()]
    assert titles == ["Second", "First"]


def test_taste_twins_are_cached(client):
    client.headers.update(ORIGIN)
    _register(client, "twinseeker")
    with patch("app.services.taste.get_taste_twins", return_value=[]) as compute:
        assert client.get("/api/discovery/taste-twins?username=twinseeker").json() == []
        assert client.get("/api/discovery/taste-twins?username=twinseeker").json() == []
    compute.assert_called_once()


def test_taste_twins_still_check_visibility(client):
    assert client.get("/api/discovery/taste-twins?username=nobody_here").status_code == 404
