"""Admin audit log, moderation, user card, catalog editing, analytics,
broadcasts and system status."""
import asyncio
import os
import time
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.security import create_session_token
from app.database import SessionLocal
from app.models import (
    Achievement,
    AdminAuditLog,
    ApiKey,
    Notification,
    PushSubscription,
    Scrobble,
    ScrobbleComment,
    Track,
    User,
    UserAchievement,
)
from app.services import audit, broadcast, system_status

ORIGIN = {"Origin": "http://localhost:3000"}


@pytest.fixture
def admin_client(client, db):
    client.headers.update(ORIGIN)
    for name in ("boss", "target", "other"):
        client.post("/auth/register", json={"username": name, "password": "password"})
    boss = db.query(User).filter(User.username == "boss").first()
    boss.role = "admin"
    db.commit()
    client.cookies.clear()
    client.cookies.set("api_key", create_session_token(str(boss.id), str(boss.hashed_password)))
    return client


def _session(fn):
    s = SessionLocal()
    try:
        return fn(s)
    finally:
        s.close()


def _uid(name):
    return _session(lambda s: s.query(User.id).filter(User.username == name).scalar())


def _play(username, title="Song", artist="Band", listened=200, played_at=None, xp=1):
    def make(s):
        track = s.query(Track).filter_by(title=title, artist=artist).first()
        if not track:
            track = Track(title=title, artist=artist, duration=200)
            s.add(track)
            s.flush()
        when = played_at or datetime.now(UTC)
        sc = Scrobble(user_id=_uid(username), track_id=track.id, source="yandex", is_playing=False,
                      listened_sec=listened, played_at=when, updated_at=when, xp_earned=xp)
        s.add(sc)
        s.commit()
        return sc.id, track.id
    return _session(make)


def _audit_actions():
    return _session(lambda s: [a for (a,) in s.query(AdminAuditLog.action).order_by(AdminAuditLog.id)])


# --- audit log -----------------------------------------------------------------

def test_admin_actions_are_audited(admin_client):
    admin_client.post("/api/admin/users/target/ban", json={"is_banned": True})
    admin_client.post("/api/admin/users/target/role", json={"role": "moderator"})
    admin_client.post("/api/admin/economy/multiplier", json={"multiplier": 2})
    admin_client.post("/api/admin/feature-flags", json={"key": "beta"})
    admin_client.post("/api/admin/cache/flush")
    assert _audit_actions() == ["user.ban", "user.role", "economy.multiplier", "flag.create", "system.cache_flush"]

    data = admin_client.get("/api/admin/audit").json()
    assert data["total"] == 5
    newest = data["items"][0]
    assert (newest["admin"], newest["action"]) == ("boss", "system.cache_flush")
    role = next(i for i in data["items"] if i["action"] == "user.role")
    assert role["target"] == "target"
    assert role["details"] == {"old": "user", "new": "moderator"}
    assert "user.ban" in data["actions"]

    assert admin_client.get("/api/admin/audit?action=user.ban").json()["total"] == 1
    assert admin_client.get("/api/admin/audit?target=targ").json()["total"] == 2
    assert admin_client.get("/api/admin/audit?admin=nobody").json()["total"] == 0
    assert len(admin_client.get("/api/admin/audit?limit=2&offset=1").json()["items"]) == 2


def test_failed_actions_are_not_audited(admin_client):
    admin_client.post("/api/admin/users/ghost/ban", json={"is_banned": True})
    admin_client.post("/api/admin/users/target/role", json={"role": "god"})
    assert _audit_actions() == []


def test_audit_details_are_truncated(db):
    admin = User(username="a", hashed_password="x")
    db.add(admin)
    db.flush()
    audit.record(db, admin, "x.long", "t", text="y" * 5000)
    db.commit()
    entry = audit.list_entries(db)["items"][0]
    assert isinstance(entry["details"], str)
    assert len(entry["details"]) == audit.MAX_DETAILS


def test_achievement_endpoints_are_audited(admin_client):
    track_id = _play("target")[1]
    res = admin_client.post("/api/admin/achievements", json={
        "name": "Custom", "description": "d", "icon": "🎯", "rule_type": "manual",
        "rule_value": 1, "reward_xp": 50})
    assert res.status_code == 200
    ach_id = _session(lambda s: s.query(Achievement.id).filter_by(name="Custom").scalar())
    admin_client.post("/api/admin/users/target/achievements", json={"achievement_id": ach_id})
    admin_client.delete(f"/api/admin/users/target/achievements/{ach_id}")
    admin_client.post("/api/admin/users/target/level", json={"new_level": 5})
    admin_client.delete(f"/api/admin/tracks/{track_id}")
    admin_client.delete("/api/admin/users/target/scrobbles")
    admin_client.delete(f"/api/admin/achievements/{ach_id}")
    assert _audit_actions() == [
        "achievement.create", "achievement.grant", "achievement.revoke", "user.level",
        "catalog.delete_track", "user.wipe_scrobbles", "achievement.delete"]
    assert admin_client.delete(f"/api/admin/achievements/{ach_id}").status_code == 404
    assert admin_client.delete(f"/api/admin/tracks/{track_id}").status_code == 404


def test_level_is_based_on_xp_not_play_count(admin_client):
    _play("target", xp=2)
    _play("target", title="Other", xp=2)
    admin_client.post("/api/admin/users/target/level", json={"new_level": 3})
    bonus = _session(lambda s: s.query(User).filter_by(username="target").one().integration.bonus_xp)
    assert bonus == 200 - 4  # level 3 = 200 XP, 4 of them already earned


def test_audit_requires_admin(client):
    client.headers.update(ORIGIN)
    client.post("/auth/register", json={"username": "pleb", "password": "password"})
    assert client.get("/api/admin/audit").status_code == 403


# --- comments --------------------------------------------------------------------

def test_comment_moderation(admin_client):
    scrobble_id = _play("target", title="Commented")[0]

    def add_comments(s):
        other = s.query(User).filter_by(username="other").one()
        s.add_all([ScrobbleComment(user_id=other.id, scrobble_id=scrobble_id, content="nice track"),
                   ScrobbleComment(user_id=other.id, scrobble_id=scrobble_id, content="buy cheap pills")])
        s.commit()
    _session(add_comments)

    data = admin_client.get("/api/admin/comments").json()
    assert data["total"] == 2
    spam = data["items"][0]
    assert spam["content"] == "buy cheap pills"
    assert spam["author"]["username"] == "other"
    assert spam["scrobble"] == {"id": scrobble_id, "title": "Commented", "artist": "Band", "owner": "target"}
    assert admin_client.get("/api/admin/comments?q=pills").json()["total"] == 1
    assert admin_client.get("/api/admin/comments?username=target").json()["total"] == 0

    assert admin_client.delete(f"/api/admin/comments/{spam['id']}").status_code == 200
    assert admin_client.get("/api/admin/comments").json()["total"] == 1
    assert admin_client.delete(f"/api/admin/comments/{spam['id']}").status_code == 404
    entry = admin_client.get("/api/admin/audit").json()["items"][0]
    assert (entry["action"], entry["target"], entry["details"]["text"]) == (
        "comment.delete", "other", "buy cheap pills")


# --- user card ---------------------------------------------------------------------

def test_user_details_and_revocations(admin_client):
    _play("target", xp=2)
    _play("target", title="Skipped", listened=5)

    def extras(s):
        user = s.query(User).filter_by(username="target").one()
        s.add(ApiKey(user_id=user.id, key_hash="h1", prefix="vm_abc", name="Device", is_active=True))
        s.add(PushSubscription(user_id=user.id, endpoint="https://push.example/1", p256dh="p", auth="a"))
        s.add(UserAchievement(user_id=user.id, achievement_id=1))
        s.commit()
    _session(extras)

    data = admin_client.get("/api/admin/users/target/details").json()
    assert data["user"]["username"] == "target"
    assert data["user"]["created_at"] is not None
    assert data["stats"]["scrobbles"] == 2
    assert data["stats"]["counted"] == 1
    assert data["stats"]["xp"] == 2
    assert data["push_subscriptions"] == 1
    assert [k["prefix"] for k in data["api_keys"]] == ["vm_abc"]
    assert len(data["recent_scrobbles"]) == 2
    assert data["achievements"][0]["id"] == 1
    assert data["export"] == {"lastfm": False, "listenbrainz": False, "librefm": False}

    version = data["user"]["session_version"]
    assert admin_client.post("/api/admin/users/target/sessions/revoke").status_code == 200
    assert admin_client.get("/api/admin/users/target/details").json()["user"]["session_version"] == version + 1

    key_id = data["api_keys"][0]["id"]
    assert admin_client.post(f"/api/admin/users/target/api-keys/{key_id}/revoke").status_code == 200
    assert admin_client.get("/api/admin/users/target/details").json()["api_keys"][0]["is_active"] is False
    assert admin_client.post(f"/api/admin/users/other/api-keys/{key_id}/revoke").status_code == 404
    assert admin_client.get("/api/admin/users/ghost/details").status_code == 404
    assert _audit_actions()[-2:] == ["user.revoke_sessions", "user.revoke_api_key"]


# --- catalog ----------------------------------------------------------------------

def test_track_search_and_edit(admin_client):
    _, track_id = _play("target", title="Old Title", artist="Old Artist")
    _play("other", title="Old Title", artist="Old Artist")
    _play("target", title="Unrelated", artist="Someone")

    found = admin_client.get("/api/admin/tracks?q=old").json()
    assert found["total"] == 1
    assert found["items"][0]["plays"] == 2
    assert admin_client.get(f"/api/admin/tracks?q={track_id}").json()["items"][0]["id"] == track_id
    assert admin_client.get("/api/admin/tracks?limit=1").json()["total"] == 2

    res = admin_client.put(f"/api/admin/tracks/{track_id}", json={
        "title": " New Title ", "album": "", "duration": 245, "cover_url": "https://img.example/c.jpg"})
    track = res.json()["track"]
    assert (track["title"], track["album"], track["duration"], track["cover_url"]) == (
        "New Title", None, 245, "https://img.example/c.jpg")
    assert admin_client.put(f"/api/admin/tracks/{track_id}", json={"cover_url": "javascript:alert(1)"}).status_code == 422
    assert admin_client.put(f"/api/admin/tracks/{track_id}", json={"duration": 99999}).status_code == 422
    assert admin_client.put(f"/api/admin/tracks/{track_id}", json={"artist": "  "}).status_code == 400
    assert admin_client.put("/api/admin/tracks/999999", json={"title": "x"}).status_code == 404
    entry = admin_client.get("/api/admin/audit?action=catalog.edit_track").json()["items"][0]
    assert entry["details"]["duration"] == 245


# --- analytics ----------------------------------------------------------------------

def test_timeseries(admin_client):
    today = datetime.now(UTC).replace(hour=12)
    _play("target", played_at=today)
    _play("target", title="Two", played_at=today)
    _play("other", played_at=today - timedelta(days=2))
    _play("other", title="Skip", played_at=today, listened=3)  # not counted
    _play("other", title="Old", played_at=today - timedelta(days=60))  # out of range

    data = admin_client.get("/api/admin/analytics/timeseries?days=7").json()
    assert len(data["days"]) == 7
    assert data["days"][-1] == today.date().isoformat()
    assert data["scrobbles"][-1] == 2
    assert data["active_users"][-1] == 1
    assert data["scrobbles"][-3] == 1
    assert sum(data["scrobbles"]) == 3
    assert data["registrations"][-1] == 3  # boss, target, other signed up today
    assert admin_client.get("/api/admin/analytics/timeseries?days=3").status_code == 422


# --- broadcast ----------------------------------------------------------------------

def test_broadcast_inapp_and_push(admin_client):
    with patch("app.core.redis.enqueue_background_task", new=AsyncMock(return_value=True)) as enqueue:
        res = admin_client.post("/api/admin/broadcast", json={
            "title": "Обновление", "message": "Новая функция!", "url": "/settings",
            "channels": ["inapp", "push"]})
    assert res.status_code == 200
    body = res.json()
    assert (body["recipients"], body["inapp"], body["push_queued"]) == (3, 2, True)  # admin gets no in-app copy
    assert enqueue.await_args.args == ("broadcast_push", "Обновление", "Новая функция!", "/settings", None)

    admin_client.cookies.clear()
    target_id = _uid("target")
    target = _session(lambda s: s.get(User, target_id))
    admin_client.cookies.set("api_key", create_session_token(str(target.id), str(target.hashed_password)))
    item = admin_client.get("/api/me/notifications").json()["items"][0]
    assert (item["kind"], item["text"]) == ("system", "Обновление: Новая функция!")


def test_broadcast_to_listed_users_and_validation(admin_client):
    with patch("app.core.redis.enqueue_background_task", new=AsyncMock(return_value=True)) as enqueue:
        res = admin_client.post("/api/admin/broadcast", json={
            "message": "Hi", "channels": ["push"], "usernames": ["target"]})
    assert res.json()["inapp"] == 0
    assert enqueue.await_args.args[-1] == [_uid("target")]
    assert _session(lambda s: s.query(Notification).count()) == 0

    bad = [
        {"message": "x", "url": "https://evil.example"},
        {"message": "x", "url": "//evil.example"},
        {"message": "x", "channels": ["sms"]},
        {"message": ""},
    ]
    for payload in bad:
        assert admin_client.post("/api/admin/broadcast", json=payload).status_code == 422, payload
    assert admin_client.post("/api/admin/broadcast", json={"message": "x", "usernames": ["ghost"]}).status_code == 400


def test_broadcast_push_delivery(db):
    active = User(username="subscriber", hashed_password="x")
    banned = User(username="banned", hashed_password="x", is_banned=True)
    db.add_all([active, banned])
    db.flush()
    db.add_all([PushSubscription(user_id=active.id, endpoint="https://p/1", p256dh="k", auth="a"),
                PushSubscription(user_id=banned.id, endpoint="https://p/2", p256dh="k", auth="a")])
    db.commit()
    with patch("app.services.push_notifications.is_enabled", return_value=True), \
            patch("app.services.push_notifications.notify_user_push", new=AsyncMock(return_value=1)) as push:
        assert asyncio.run(broadcast.send_broadcast_push("T", "B", "/")) == 1
        assert push.await_args.args[0] == active.id
        assert asyncio.run(broadcast.send_broadcast_push("T", "B", "/", [banned.id])) == 0
    with patch("app.services.push_notifications.is_enabled", return_value=True), \
            patch("app.services.push_notifications.notify_user_push", new=AsyncMock(side_effect=RuntimeError)):
        assert asyncio.run(broadcast.send_broadcast_push("T", "B", "/")) == 0
    with patch("app.services.push_notifications.is_enabled", return_value=False):
        assert asyncio.run(broadcast.send_broadcast_push("T", "B", "/")) == 0
    assert broadcast.compose("", " Only message ") == "Only message"
    assert len(broadcast.compose("T", "x" * 500)) == broadcast.MESSAGE_LENGTH


def test_broadcast_worker_job_and_fallback():
    from app import worker
    from app.core import redis as redis_module
    with patch("app.services.broadcast.send_broadcast_push", new=AsyncMock()) as send:
        asyncio.run(worker.broadcast_push({}, "T", "B", "/", [1]))
        send.assert_awaited_once_with("T", "B", "/", [1])
    with patch("app.services.broadcast.send_broadcast_push", new=AsyncMock(side_effect=RuntimeError)):
        asyncio.run(redis_module._run_broadcast_push_job("T", "B", "/"))  # logged, not raised


# --- system status --------------------------------------------------------------------

def test_system_status(admin_client, tmp_path, monkeypatch):
    backups = tmp_path / "backups"
    backups.mkdir()
    (backups / "veinmusic-1.dump").write_bytes(b"x" * 10)
    newest = backups / "veinmusic-2.dump"
    newest.write_bytes(b"x" * 20)
    os.utime(newest, (time.time() + 5, time.time() + 5))
    (backups / "notes.txt").write_text("ignored")
    monkeypatch.setenv("BACKUP_DIR", str(backups))

    data = admin_client.get("/api/admin/system/status").json()
    assert data["backups"]["count"] == 2
    assert data["backups"]["latest"]["name"] == "veinmusic-2.dump"
    assert data["backups"]["bytes"] == 30
    assert data["database"]["dialect"] in ("sqlite", "postgresql")
    assert data["uploads"]["available"] is True
    assert set(data["worker"]["cron"]) == set(system_status.CRON_JOBS)

    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "missing"))
    assert admin_client.get("/api/admin/system/status").json()["backups"]["available"] is False


def test_worker_status_and_cron_marks():
    redis = MagicMock()
    redis.zcard = AsyncMock(return_value=4)
    redis.get = AsyncMock(return_value="2026-01-01T00:00:00+00:00")
    with patch("app.core.redis.get_redis_client", return_value=redis):
        status = asyncio.run(system_status.worker_status())
    assert status["queued_jobs"] == 4
    assert status["cron"]["cloud_poll"] == "2026-01-01T00:00:00+00:00"

    redis.zcard = AsyncMock(side_effect=ConnectionError)
    with patch("app.core.redis.get_redis_client", return_value=redis):
        assert asyncio.run(system_status.worker_status())["redis"] is False

    redis.set = AsyncMock()
    asyncio.run(system_status.mark_cron_run(redis, "cloud_poll"))
    assert redis.set.await_args.args[0] == "cron:last:cloud_poll"
    redis.set = AsyncMock(side_effect=ConnectionError)
    asyncio.run(system_status.mark_cron_run(redis, "cloud_poll"))  # never raises

    from app import worker
    with patch("app.services.system_status.mark_cron_run", new=AsyncMock()) as mark:
        asyncio.run(worker._mark_cron_run({"redis": redis}, "cleanup_uploads"))
        asyncio.run(worker._mark_cron_run({}, "cleanup_uploads"))
    mark.assert_awaited_once()


def test_database_size_on_postgres(db):
    info = system_status.database_status(db)
    if info["dialect"] == "postgresql":
        assert info["bytes"] > 0
    else:
        assert info["bytes"] is None
