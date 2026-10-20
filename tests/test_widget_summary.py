import datetime

from app.database import SessionLocal
from app.models import Scrobble, Track, User


def _play(db, user, track, minutes_ago, listened=200, playing=False):
    played = datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=minutes_ago)
    db.add(Scrobble(user_id=user.id, track_id=track.id, played_at=played, updated_at=played,
                    listened_sec=listened, is_playing=playing, source="yandex"))


def test_widget_summary_needs_sign_in(client):
    assert client.get("/api/widgets/me/summary").status_code == 401


def test_widget_summary_shows_latest_play_and_week(client):
    reg = client.post("/auth/register", json={"username": "widgeter", "password": "password"})
    assert reg.status_code == 200
    db = SessionLocal()
    user = db.query(User).filter(User.username == "widgeter").one()
    a = Track(title="Song A", artist="Artist A", duration=200)
    b = Track(title="Song B", artist="Artist B", duration=200)
    db.add_all([a, b])
    db.flush()
    _play(db, user, a, 60 * 24 * 10)  # older than a week
    _play(db, user, a, 120)
    _play(db, user, a, 90)
    _play(db, user, b, 0, playing=True)
    db.commit()
    db.close()

    data = client.get("/api/widgets/me/summary").json()
    assert data["username"] == "widgeter"
    assert data["now"]["title"] == "Song B"
    assert data["now"]["is_playing"] is True
    assert data["week"]["plays"] == 3
    assert data["week"]["minutes"] == 10
    assert data["week"]["top_artist"] == "Artist A"
    assert data["week"]["top_track"] == {"title": "Song A", "artist": "Artist A"}


def test_widget_summary_reads_with_a_read_only_key(client):
    client.post("/auth/register", json={"username": "widgetkey", "password": "password"})
    client.headers["Origin"] = "http://localhost:3000"
    key = client.post("/api/developer/keys", json={"name": "iPhone", "scopes": "profile:read"})
    assert key.status_code == 200, key.text
    client.cookies.clear()
    resp = client.get("/api/widgets/me/summary", headers={"X-API-Key": key.json()["api_key"]})
    assert resp.status_code == 200
    assert resp.json() == {"username": "widgetkey", "now": None,
                           "week": {"plays": 0, "minutes": 0, "top_artist": None, "top_track": None}}
