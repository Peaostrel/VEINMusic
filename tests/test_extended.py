import datetime
import pytest
from app.database import SessionLocal
from app.models import Scrobble, Track, User


@pytest.fixture
def auth_client(client):
    client.post(
        "/auth/register",
        json={
            "username": "extendeduser",
            "password": "password"})
    client.headers["Origin"] = "http://localhost:3000"
    return client


@pytest.fixture
def auth_user(db, auth_client):
    db.close()
    db = SessionLocal()
    return db.query(User).filter(User.username == "extendeduser").first()


def test_user_mood_empty(client, db, auth_user):
    resp = client.get(f"/api/user/mood?username={auth_user.username}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mood"] == "Тишина"


def test_user_mood_rock(auth_client, db, auth_user):
    track = Track(
        title="Rock Song",
        artist="Rock Band",
        genre="rock",
        duration=150)
    db.add(track)
    db.commit()
    scrobble = Scrobble(
        user_id=auth_user.id,
        track_id=track.id,
        played_at=datetime.datetime.now(datetime.timezone.utc),
        listened_sec=150,
        source="yandex"
    )
    db.add(scrobble)
    db.commit()

    resp = auth_client.get(f"/api/user/mood?username={auth_user.username}")
    assert resp.status_code == 200
    assert resp.json()["mood"] == "Энергичный хайп"


def test_get_wrapped_stats(auth_client, db, auth_user):
    # Setup some scrobbles
    track = Track(title="Song 1", artist="Artist 1", duration=200)
    db.add(track)
    db.commit()
    scrobble = Scrobble(
        user_id=auth_user.id,
        track_id=track.id,
        played_at=datetime.datetime.now(datetime.timezone.utc),
        listened_sec=200,
        source="yandex"
    )
    db.add(scrobble)
    db.commit()

    resp = auth_client.get(f"/api/stats/wrapped?username={auth_user.username}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["top_artist"] == "Artist 1"
    assert data["total_minutes"] == 3


def test_get_detailed_stats(auth_client, db, auth_user):
    track = Track(title="Detailed", artist="DetailArtist", duration=120)
    db.add(track)
    db.commit()
    scrobble = Scrobble(
        user_id=auth_user.id,
        track_id=track.id,
        played_at=datetime.datetime.now(datetime.timezone.utc),
        listened_sec=120,
        source="yandex"
    )
    db.add(scrobble)
    db.commit()

    resp = auth_client.get(
        f"/api/detailed-stats/{auth_user.username}?period=all")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_scrobbles"] == 1
    assert data["unique_artists"] == 1
    assert data["unique_tracks"] == 1
    assert data["top_artists"][0]["name"] == "DetailArtist"
