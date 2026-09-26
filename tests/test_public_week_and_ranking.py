"""Landing-page weekly stats and the leaderboard's following / my-place views."""
from datetime import UTC, datetime, timedelta

from app.core.security import create_session_token
from app.database import SessionLocal
from app.models import Follow, Scrobble, Track, User


def _register(client, username):
    client.post("/auth/register", json={"username": username, "password": "password"})


def _login_as(client, username):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        token = create_session_token(str(user.id), str(user.hashed_password))
    finally:
        db.close()
    client.cookies.clear()
    client.cookies.set("api_key", token)


def _listen(username, artist, count, *, days_ago=0, listened=200, xp=10):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        track = Track(title=f"{artist} song", artist=artist, duration=200)
        db.add(track)
        db.flush()
        when = datetime.now(UTC) - timedelta(days=days_ago)
        for _ in range(count):
            db.add(Scrobble(user_id=user.id, track_id=track.id, played_at=when,
                            updated_at=when, source="test", listened_sec=listened,
                            is_playing=False, xp_earned=xp))
        db.commit()
    finally:
        db.close()


def _set_private(username):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        user.profile.is_private = True
        db.commit()
    finally:
        db.close()


def _follow(follower, following):
    db = SessionLocal()
    try:
        a = db.query(User).filter(User.username == follower).first()
        b = db.query(User).filter(User.username == following).first()
        db.add(Follow(follower_id=a.id, following_id=b.id))
        db.commit()
    finally:
        db.close()


def test_week_counts_completed_public_plays(client):
    _register(client, "wk_public")
    _listen("wk_public", "Кино", 3)
    _listen("wk_public", "Сплин", 1, days_ago=2)
    _listen("wk_public", "Земфира", 5, listened=30)  # skipped, not counted
    _listen("wk_public", "Агата Кристи", 4, days_ago=9)  # outside the week
    _register(client, "wk_private")
    _set_private("wk_private")
    _listen("wk_private", "Тайна", 10)

    body = client.get("/api/public-stats/week").json()
    assert len(body["days"]) == 7
    assert body["days"][-1]["date"] == body["to"]
    assert body["total_plays"] == 4
    assert body["days"][-1]["plays"] == 3
    assert body["top_artist"] == {"name": "Кино", "plays": 3}
    assert body["hours"] == round(4 * 200 / 3600, 1)


def test_week_is_empty_without_listens(client):
    body = client.get("/api/public-stats/week").json()
    assert body["total_plays"] == 0
    assert body["top_artist"] is None
    assert all(d["plays"] == 0 for d in body["days"])


def test_leaderboard_entries_carry_global_rank(client):
    for name, count in (("lb_a", 1), ("lb_b", 3), ("lb_c", 2)):
        _register(client, name)
        _listen(name, "X", count)
    board = client.get("/api/leaderboard").json()
    assert [e["username"] for e in board] == ["lb_b", "lb_c", "lb_a"]
    assert [e["rank"] for e in board] == [1, 2, 3]


def test_following_board_and_my_place(client):
    for name, count in (("me_user", 2), ("friend", 5), ("stranger", 9), ("other", 1)):
        _register(client, name)
        _listen(name, "X", count)
    _follow("me_user", "friend")
    _login_as(client, "me_user")

    following = client.get("/api/leaderboard/following").json()
    assert [(e["username"], e["rank"]) for e in following] == [("friend", 2), ("me_user", 3)]

    me = client.get("/api/leaderboard/me").json()
    assert me["rank"] == 3
    assert me["total"] == 4
    assert me["ahead"] == {"username": "friend", "display_name": "friend", "gap_xp": 30}


def test_following_board_requires_login(client):
    assert client.get("/api/leaderboard/following").status_code == 401
    assert client.get("/api/leaderboard/me").status_code == 401
