"""Fake players can't advertise links or get unplayed titles indexed."""
from datetime import UTC, datetime, timedelta

import pytest

from app.core.security import create_session_token
from app.models import Scrobble, Track, User, UserIntegration, UserProfile


@pytest.fixture
def listener(db):
    user = User(username="catalog_listener", hashed_password="x", profile=UserProfile(),
                integration=UserIntegration())
    db.add(user)
    db.commit()
    return user, {"X-API-Key": create_session_token(str(user.id), "x", int(user.session_version))}


@pytest.mark.parametrize("title,artist", [
    ("Buy followers https://spam.example", "Artist"),
    ("Song", "www.spam.example"),
    ("Join t.me/spamchannel", "Artist"),
    ("Song", "discord.gg/spam"),
    ("Скидки bit.ly/xyz", "Artist"),
])
def test_links_in_metadata_are_not_recorded(client, db, listener, title, artist):
    data = {"title": title, "artist": artist, "source": "plat", "duration": 180}
    assert client.post("/api/scrobble", json=data, headers=listener[1]).json()["status"] == "link_ignored"
    assert db.query(Scrobble).count() == 0


@pytest.mark.parametrize("title,artist", [
    ("Still D.R.E.", "Dr.Dre"), ("Love.com", "Brittany Murphy"), ("Т.Е.Х.Н.О.", "Artist"),
])
def test_dotted_names_are_music(client, db, listener, title, artist):
    data = {"title": title, "artist": artist, "source": "plat", "duration": 180}
    assert client.post("/api/scrobble", json=data, headers=listener[1]).json()["status"] == "ok"


def _play(db, user, title, artist, listened):
    track = Track(title=title, artist=artist, duration=180)
    db.add(track)
    db.flush()
    when = datetime.now(UTC) - timedelta(hours=1)
    db.add(Scrobble(user_id=user.id, track_id=track.id, source="plat", listened_sec=listened,
                    is_playing=False, played_at=when, updated_at=when))
    db.commit()
    return track


def test_only_counted_music_is_offered_to_search_engines(client, db, listener):
    user, _ = listener
    real = _play(db, user, "Real Song", "Real Artist", 170)
    fake = _play(db, user, "Casino Bonus", "Spam Artist", 3)
    sitemap = client.get("/api/preview/sitemap").json()
    artists = set(sitemap["artists"])
    tracks = {item["id"] for item in sitemap["tracks"]}
    assert "Real Artist" in artists
    assert "Spam Artist" not in artists
    assert real.id in tracks
    assert fake.id not in tracks
    # Pages stay viewable, but are marked not to index
    assert client.get("/api/preview/artist/Spam Artist").json()["indexable"] is False
    assert client.get(f"/api/preview/track/{fake.id}").json()["indexable"] is False
    assert client.get("/api/preview/artist/Real Artist").json()["indexable"] is True
    assert client.get(f"/api/preview/track/{real.id}").json()["indexable"] is True
