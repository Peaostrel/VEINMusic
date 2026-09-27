from unittest.mock import patch

from app.models import Scrobble, Track, User, UserProfile


def _listener(db, name, artists):
    user = User(username=name, hashed_password="x")
    user.profile = UserProfile()
    db.add(user)
    db.flush()
    for artist, cover in artists:
        track = Track(title=f"{artist} song", artist=artist, cover_url=cover, duration=180)
        db.add(track)
        db.flush()
        db.add(Scrobble(user_id=user.id, track_id=track.id, listened_sec=180, source="test"))
    db.commit()
    return user


def test_recommendations_from_taste_twins(client, db):
    """Artists the twins play and the user does not. The query used to fail
    on SQLite (tuple IN) and on Postgres (ungrouped cover_url) as soon as a
    user had twins."""
    _listener(db, "rec_me", [("Кино", None)])
    _listener(db, "rec_twin", [("Кино", None), ("Сплин", "https://img/a.jpg"), ("Сплин", "https://img/b.jpg")])
    with patch("app.routers.discovery.get_taste_twins", return_value=[{"username": "rec_twin"}]):
        resp = client.get("/api/recommendations", params={"username": "rec_me"})
    assert resp.status_code == 200, resp.text
    recs = resp.json()
    assert [r["artist"] for r in recs] == ["Сплин"]
    assert recs[0]["cover_url"] in {"https://img/a.jpg", "https://img/b.jpg"}
