import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.core.security import create_session_token
from app.database import SessionLocal
from app.models import Notification, Scrobble, Track, User
from app.services import notifications


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


def _user_id(username):
    db = SessionLocal()
    try:
        return db.query(User.id).filter(User.username == username).scalar()
    finally:
        db.close()


def _make_scrobble(owner_id, title="Song"):
    db = SessionLocal()
    try:
        track = Track(title=title, artist="Artist", duration=200)
        db.add(track)
        db.flush()
        scrobble = Scrobble(user_id=owner_id, track_id=track.id, source="yandex", is_playing=False)
        db.add(scrobble)
        db.commit()
        return scrobble.id
    finally:
        db.close()


@pytest.fixture
def social(client):
    """Two users: alice owns a scrobble, bob interacts with it."""
    client.headers["Origin"] = "http://localhost:3000"
    _register(client, "alice")
    _register(client, "bob")
    scrobble_id = _make_scrobble(_user_id("alice"))
    _login_as(client, "bob")
    return client, scrobble_id


def _alice_notifications(client):
    _login_as(client, "alice")
    res = client.get("/api/me/notifications")
    assert res.status_code == 200
    return res.json()


def test_like_creates_one_notification_and_unlike_removes_it(social):
    client, scrobble_id = social
    assert client.post(f"/api/scrobble/{scrobble_id}/like").json()["status"] == "liked"
    data = _alice_notifications(client)
    assert data["unread"] == 1
    item = data["items"][0]
    assert item["kind"] == "like"
    assert item["actor"]["username"] == "bob"
    assert item["track"] == {"title": "Song", "artist": "Artist"}
    assert "«Song»" in item["text"]

    # Unlike while unread drops it; liking again doesn't duplicate
    _login_as(client, "bob")
    assert client.post(f"/api/scrobble/{scrobble_id}/like").json()["status"] == "unliked"
    assert _alice_notifications(client)["unread"] == 0
    _login_as(client, "bob")
    client.post(f"/api/scrobble/{scrobble_id}/like")
    client.post(f"/api/scrobble/{scrobble_id}/like")
    client.post(f"/api/scrobble/{scrobble_id}/like")
    assert _alice_notifications(client)["unread"] == 1


def test_comment_notification_keeps_excerpt(social):
    client, scrobble_id = social
    text = "x" * 500
    res = client.post(f"/api/scrobble/{scrobble_id}/comment", json={"content": text})
    assert res.status_code == 200
    item = _alice_notifications(client)["items"][0]
    assert item["kind"] == "comment"
    assert item["message"] == "x" * notifications.EXCERPT_LENGTH


def test_own_actions_do_not_notify(client):
    client.headers["Origin"] = "http://localhost:3000"
    _register(client, "solo")
    scrobble_id = _make_scrobble(_user_id("solo"))
    client.post(f"/api/scrobble/{scrobble_id}/like")
    client.post(f"/api/scrobble/{scrobble_id}/comment", json={"content": "hi"})
    assert client.get("/api/me/notifications").json() == {"items": [], "unread": 0}


def test_follow_notification_and_unfollow(social):
    client, _ = social
    assert client.post("/api/follow/alice", json={}).status_code == 200
    item = _alice_notifications(client)["items"][0]
    assert item["kind"] == "follow"
    assert item["track"] is None
    assert "подписался" in item["text"]

    _login_as(client, "bob")
    client.post("/api/follow/alice", json={})  # unfollow
    assert _alice_notifications(client)["unread"] == 0


def test_mark_read_selected_and_all(social):
    client, scrobble_id = social
    client.post(f"/api/scrobble/{scrobble_id}/like")
    client.post(f"/api/scrobble/{scrobble_id}/comment", json={"content": "one"})
    client.post("/api/follow/alice", json={})
    data = _alice_notifications(client)
    assert data["unread"] == 3

    first = data["items"][0]["id"]
    res = client.post("/api/me/notifications/read", json={"ids": [first]})
    assert res.json() == {"status": "ok", "updated": 1}
    assert client.get("/api/me/notifications").json()["unread"] == 2

    res = client.post("/api/me/notifications/read", json={"ids": None})
    assert res.json()["updated"] == 2
    data = client.get("/api/me/notifications").json()
    assert data["unread"] == 0
    assert all(i["is_read"] for i in data["items"])


def test_mark_read_ignores_other_users_notifications(social):
    client, scrobble_id = social
    client.post(f"/api/scrobble/{scrobble_id}/like")
    note_id = _alice_notifications(client)["items"][0]["id"]
    _login_as(client, "bob")
    assert client.post("/api/me/notifications/read", json={"ids": [note_id]}).json()["updated"] == 0
    assert _alice_notifications(client)["unread"] == 1


def test_notifications_require_auth(client):
    assert client.get("/api/me/notifications").status_code == 401


def test_list_limit_is_validated(social):
    client, _ = social
    assert client.get("/api/me/notifications?limit=0").status_code == 422
    assert client.get(f"/api/me/notifications?limit={notifications.MAX_LIST + 1}").status_code == 422


def test_deleting_account_removes_its_notifications(social):
    client, scrobble_id = social
    client.post(f"/api/scrobble/{scrobble_id}/like")
    db = SessionLocal()
    try:
        notifications.delete_for_user(db, _user_id("bob"))
        db.commit()
        assert db.query(Notification).count() == 0
    finally:
        db.close()


def test_create_rejects_unknown_kind(db):
    assert notifications.create(db, recipient_id=1, actor_id=2, kind="poke") is None


def test_push_payload_and_send(social):
    client, scrobble_id = social
    client.post(f"/api/scrobble/{scrobble_id}/comment", json={"content": "nice"})
    client.post("/api/follow/alice", json={})
    db = SessionLocal()
    try:
        comment = db.query(Notification).filter_by(kind="comment").one()
        follow = db.query(Notification).filter_by(kind="follow").one()
        alice_id = _user_id("alice")
    finally:
        db.close()

    recipient, title, body, url = notifications._push_payload(comment.id)
    assert recipient == alice_id
    assert title == "VEIN Music"
    assert body.endswith(": nice")
    assert url == "/"
    assert notifications._push_payload(follow.id)[3] == "/user/bob"
    assert notifications._push_payload(999999) is None

    with patch("app.services.push_notifications.is_enabled", return_value=True), \
            patch("app.services.push_notifications.notify_user_push", new=AsyncMock()) as send:
        asyncio.run(notifications.send_social_push(comment.id))
        send.assert_awaited_once()
        assert send.await_args.args[0] == alice_id

    with patch("app.services.push_notifications.is_enabled", return_value=False), \
            patch("app.services.push_notifications.notify_user_push", new=AsyncMock()) as send:
        asyncio.run(notifications.send_social_push(comment.id))
        send.assert_not_awaited()


def test_send_social_push_swallows_delivery_errors(social):
    client, scrobble_id = social
    client.post(f"/api/scrobble/{scrobble_id}/like")
    db = SessionLocal()
    try:
        note_id = db.query(Notification.id).scalar()
    finally:
        db.close()
    with patch("app.services.push_notifications.is_enabled", return_value=True), \
            patch("app.services.push_notifications.notify_user_push",
                  new=AsyncMock(side_effect=RuntimeError("boom"))):
        asyncio.run(notifications.send_social_push(note_id))


def test_schedule_push_skips_missing_notification():
    class Tasks:
        def __init__(self):
            self.added = []

        def add_task(self, *args):
            self.added.append(args)

    tasks = Tasks()
    notifications.schedule_push(tasks, None)
    notifications.schedule_push(None, Notification(id=1))
    assert tasks.added == []
    notifications.schedule_push(tasks, Notification(id=7))
    assert tasks.added[0][1:] == ("send_social_push", 7)
