"""Admin panel: error log, scrobble management, integrations monitor and
user reports."""
import logging

import pytest

from app.core.security import create_session_token
from app.database import SessionLocal
from app.models import User
from app.services import error_log

ORIGIN = {"Origin": "http://localhost:3000"}


def _session(fn):
    s = SessionLocal()
    try:
        return fn(s)
    finally:
        s.close()


def _login(client, username):
    user = _session(lambda s: s.query(User).filter(User.username == username).one())
    client.cookies.clear()
    client.cookies.set("api_key", create_session_token(str(user.id), str(user.hashed_password)))


@pytest.fixture
def admin_client(client, db):
    client.headers.update(ORIGIN)
    for name in ("boss", "target", "other"):
        client.post("/auth/register", json={"username": name, "password": "password"})
    boss = db.query(User).filter(User.username == "boss").first()
    boss.role = "admin"
    db.commit()
    _login(client, "boss")
    return client


# --- error log ------------------------------------------------------------------

def test_admin_log_endpoints(admin_client):
    error_log._local.clear()
    logging.getLogger("app.test").error("visible in admin")
    page = admin_client.get("/api/admin/logs?level=ERROR").json()
    assert any(e["message"] == "visible in admin" for e in page["items"])
    assert admin_client.delete("/api/admin/logs").status_code == 200
    assert admin_client.get("/api/admin/logs").json()["total"] == 0
    assert admin_client.get("/api/admin/audit?action=logs.clear").json()["total"] == 1


def test_logs_are_admin_only(admin_client):
    _login(admin_client, "target")
    assert admin_client.get("/api/admin/logs").status_code == 403
    assert admin_client.delete("/api/admin/logs").status_code == 403


# --- scrobbles --------------------------------------------------------------------

def _seed_scrobbles():
    from datetime import UTC, datetime

    from app.models import Scrobble, ScrobbleComment, Track

    def run(s):
        target = s.query(User).filter(User.username == "target").one()
        other = s.query(User).filter(User.username == "other").one()
        song = Track(title="Лесник", artist="Король и Шут", duration=200)
        ghost = Track(title="Phantom", artist="Bug", duration=200)
        s.add_all([song, ghost])
        s.flush()
        rows = [
            Scrobble(user_id=target.id, track_id=song.id, source="yandex", listened_sec=190, xp_earned=2,
                     played_at=datetime(2026, 9, 20, 12, tzinfo=UTC)),
            Scrobble(user_id=target.id, track_id=ghost.id, source="yandex", listened_sec=190, xp_earned=1,
                     played_at=datetime(2026, 9, 26, 12, tzinfo=UTC)),
            Scrobble(user_id=target.id, track_id=ghost.id, source="yandex", listened_sec=10, xp_earned=1,
                     played_at=datetime(2026, 9, 27, 12, tzinfo=UTC)),
            Scrobble(user_id=other.id, track_id=ghost.id, source="spotify", listened_sec=190, xp_earned=1,
                     played_at=datetime(2026, 9, 26, 12, tzinfo=UTC)),
        ]
        s.add_all(rows)
        s.flush()
        s.add(ScrobbleComment(user_id=other.id, scrobble_id=rows[1].id, content="?"))
        s.commit()
        return [r.id for r in rows]
    return _session(run)


def test_list_scrobbles_filters(admin_client):
    ids = _seed_scrobbles()
    page = admin_client.get("/api/admin/scrobbles?username=target").json()
    assert page["total"] == 3
    assert [i["id"] for i in page["items"]] == [ids[2], ids[1], ids[0]]  # newest first
    assert page["items"][0]["counted"] is False
    assert page["items"][1]["counted"] is True
    assert set(page["sources"]) == {"yandex", "spotify"}
    assert admin_client.get("/api/admin/scrobbles?q=phantom").json()["total"] == 3
    assert admin_client.get("/api/admin/scrobbles?source=spotify").json()["items"][0]["username"] == "other"
    period = admin_client.get("/api/admin/scrobbles?username=target&date_from=2026-09-26&date_to=2026-09-26")
    assert [i["id"] for i in period.json()["items"]] == [ids[1]]


def test_fix_and_delete_scrobble(admin_client):
    from app.models import Scrobble, ScrobbleComment, Track

    ids = _seed_scrobbles()
    resp = admin_client.put(f"/api/admin/scrobbles/{ids[1]}", json={"title": "Лесник", "artist": "Король и Шут"})
    assert resp.status_code == 200
    song_id = _session(lambda s: s.query(Track.id).filter(Track.title == "Лесник").scalar())
    assert resp.json()["track_id"] == song_id
    assert _session(lambda s: s.get(Scrobble, ids[1]).track_id) == song_id

    assert admin_client.delete(f"/api/admin/scrobbles/{ids[1]}").status_code == 200
    assert _session(lambda s: s.get(Scrobble, ids[1])) is None
    # The comment on it went too
    assert _session(lambda s: s.query(ScrobbleComment).count()) == 0
    assert admin_client.delete(f"/api/admin/scrobbles/{ids[1]}").status_code == 404
    actions = {e["action"] for e in admin_client.get("/api/admin/audit").json()["items"]}
    assert {"scrobble.fix", "scrobble.delete"} <= actions


def test_bulk_delete_is_counted_first_and_limited_to_one_user(admin_client):
    from app.models import Scrobble

    _seed_scrobbles()
    body = {"username": "target", "q": "Phantom", "date_from": "2026-09-26"}
    dry = admin_client.post("/api/admin/scrobbles/bulk-delete", json=body).json()
    assert dry == {"matched": 2, "xp": 2, "deleted": 0}
    assert _session(lambda s: s.query(Scrobble).count()) == 4

    done = admin_client.post("/api/admin/scrobbles/bulk-delete", json={**body, "dry_run": False}).json()
    assert done["deleted"] == 2
    # Only target's phantom plays: target keeps Лесник, other keeps theirs
    assert _session(lambda s: s.query(Scrobble).count()) == 2
    entry = admin_client.get("/api/admin/audit?action=scrobble.bulk_delete").json()["items"][0]
    assert entry["target"] == "target"
    assert entry["details"]["count"] == 2

    assert admin_client.post("/api/admin/scrobbles/bulk-delete",
                             json={"username": "ghost", "dry_run": False}).status_code == 404
    assert admin_client.post("/api/admin/scrobbles/bulk-delete", json={"q": "x"}).status_code == 422


def test_scrobble_admin_is_admin_only(admin_client):
    _login(admin_client, "target")
    assert admin_client.get("/api/admin/scrobbles").status_code == 403
    assert admin_client.delete("/api/admin/scrobbles/1").status_code == 403


# --- integrations and showcase ------------------------------------------------------

class FakeRedis:
    """Just enough of redis.asyncio for the live-status keys."""

    def __init__(self):
        self.hashes, self.values, self.sets = {}, {}, {}

    async def hgetall(self, key):
        return dict(self.hashes.get(key, {}))

    async def get(self, key):
        return self.values.get(key)

    async def sadd(self, key, *members):
        self.sets.setdefault(key, set()).update(members)

    async def smembers(self, key):
        return set(self.sets.get(key, set()))

    async def delete(self, key):
        for store in (self.hashes, self.values, self.sets):
            store.pop(key, None)

    def pipeline(self):
        redis, ops = self, []

        class Pipe:
            def delete(self, key):
                ops.append(("delete", key))

            def hset(self, key, mapping):
                ops.append(("hset", key, mapping))

            def expire(self, key, ttl):
                pass

            def set(self, key, value, ex=None):
                ops.append(("set", key, value))

            async def execute(self):
                for op in ops:
                    if op[0] == "delete":
                        await redis.delete(op[1])
                    elif op[0] == "hset":
                        redis.hashes.setdefault(op[1], {}).update(op[2])
                    else:
                        redis.values[op[1]] = op[2]
        return Pipe()


def _link(username, **fields):
    from app.models import UserIntegration

    def run(s):
        user = s.query(User).filter(User.username == username).one()
        integ = s.query(UserIntegration).filter(UserIntegration.user_id == user.id).first()
        if integ is None:
            integ = UserIntegration(user_id=user.id)
            s.add(integ)
        for k, v in fields.items():
            setattr(integ, k, v)
        s.commit()
        return user.id
    return _session(run)


def test_integrations_list_with_live_status(admin_client):
    import asyncio
    from unittest.mock import patch

    from app.services import yandex_live
    from app.services.yandex_ynison import Playback

    uid = _link("target", yandex_token="tok")
    _link("other", lastfm_username="other_fm")
    _link("boss", lastfm_username="")  # an emptied nick is not a link
    fake = FakeRedis()

    # The worker publishes the state of its listeners
    manager = yandex_live.LiveManager(process_func=None)
    listener = yandex_live.UserListener(uid, "tok", None)
    listener.playback, listener.received_ms = Playback("42", True, 10, 200), yandex_live._now_ms()
    listener._opened()
    manager.listeners[uid] = listener
    with patch("app.core.redis.get_redis_client", return_value=fake):
        asyncio.run(manager.publish_status())
        page = admin_client.get("/api/admin/integrations").json()
    yandex_live.connected.discard(uid)

    assert page["redis"] is True
    assert page["worker_heartbeat_ms"] > 0
    by_name = {i["username"]: i for i in page["items"]}
    assert set(by_name) == {"target", "other"}
    live = by_name["target"]["yandex_live"]
    assert live["connected"] is True
    assert live["track_id"] == "42"
    assert live["playing"] is True
    assert by_name["other"]["lastfm_username"] == "other_fm"
    assert by_name["other"]["yandex_live"] is None

    only_fm = admin_client.get("/api/admin/integrations?provider=lastfm").json()
    assert [i["username"] for i in only_fm["items"]] == ["other"]



def test_provider_can_be_paused_without_removing_credentials(admin_client):
    from app.services import cloud_scrobbling, yandex_live

    target_id = _link("target", yandex_token="ya")
    other_id = _link("other", spotify_refresh_token="sp")
    _link("boss", lastfm_username="boss_fm")

    initial = admin_client.get("/api/admin/integrations").json()["providers"]
    assert initial == {
        "yandex": {"enabled": True, "linked": 1},
        "spotify": {"enabled": True, "linked": 1},
        "soundcloud": {"enabled": True, "linked": 0},
        "lastfm": {"enabled": True, "linked": 1},
    }

    try:
        paused = admin_client.put(
            "/api/admin/integrations/providers/yandex",
            json={"enabled": False},
        )
        assert paused.json() == {"provider": "yandex", "enabled": False}
        providers = admin_client.get("/api/admin/integrations").json()["providers"]
        assert providers["yandex"] == {"enabled": False, "linked": 1}

        # The token stays in the database, while both Yandex workers ignore it.
        assert yandex_live.load_linked_users() == {}
        assert target_id not in _session(cloud_scrobbling.get_pollable_user_ids)
        assert other_id in _session(cloud_scrobbling.get_pollable_user_ids)
        assert admin_client.post(
            "/api/admin/integrations/target/yandex/reconnect"
        ).status_code == 503

        # A user can still unlink, but cannot save a new token while paused.
        _login(admin_client, "target")
        assert admin_client.post(
            "/api/integrations/yandex", json={"token": "replacement"}
        ).status_code == 503
        assert admin_client.post(
            "/api/integrations/yandex/disconnect", json={}
        ).status_code == 200
    finally:
        _login(admin_client, "boss")
        admin_client.put(
            "/api/admin/integrations/providers/yandex",
            json={"enabled": True},
        )

    actions = {
        entry["action"]
        for entry in admin_client.get("/api/admin/audit").json()["items"]
    }
    assert "integration.provider_state" in actions

def test_reconnect_and_unlink(admin_client):
    import asyncio
    from unittest.mock import AsyncMock, patch

    from app.models import UserIntegration
    from app.services import yandex_live

    uid = _link("target", yandex_token="tok", lastfm_username="fm")
    fake = FakeRedis()
    with patch("app.core.redis.get_redis_client", return_value=fake):
        assert admin_client.post("/api/admin/integrations/target/yandex/reconnect").status_code == 200
        # The worker drops that listener; the next reconcile opens a new one
        manager = yandex_live.LiveManager(process_func=None)
        listener = yandex_live.UserListener(uid, "tok", None)
        listener.stop = AsyncMock()
        manager.listeners[uid] = listener
        asyncio.run(manager._restart_requested())
    assert uid not in manager.listeners
    listener.stop.assert_awaited_once()
    assert fake.sets == {}

    # Without Redis the request can't reach the worker
    assert admin_client.post("/api/admin/integrations/target/yandex/reconnect").status_code == 503

    assert admin_client.delete("/api/admin/integrations/target/yandex").status_code == 200
    integ = _session(lambda s: s.query(UserIntegration).filter(UserIntegration.user_id == uid).one())
    assert integ.yandex_token is None
    assert integ.lastfm_username == "fm"
    assert admin_client.post("/api/admin/integrations/target/yandex/reconnect").status_code == 400
    assert admin_client.delete("/api/admin/integrations/target/github").status_code == 422
    actions = {e["action"] for e in admin_client.get("/api/admin/audit").json()["items"]}
    assert {"integration.reconnect", "integration.unlink"} <= actions


def test_showcase_refresh_and_unlock(admin_client):
    from datetime import UTC, datetime
    from unittest.mock import patch

    from app.models import UserProfile

    def seed(s):
        user = s.query(User).filter(User.username == "target").one()
        profile = user.profile
        profile.favorite_artist, profile.favorite_artist_updated_at = "Джизус", datetime.now(UTC)
        profile.favorite_track, profile.favorite_track_updated_at = "Agatha Christie — X", datetime.now(UTC)
        s.commit()
    _session(seed)

    card = admin_client.get("/api/admin/users/target/details").json()["showcase"]
    assert [(i["field"], bool(i["locked_until"])) for i in card] == [
        ("artist", True), ("track", True), ("album", False)]

    with patch("app.routers.profile.search_metadata",
               side_effect=lambda v, k: ("Джизус", "https://img/a.jpg", None) if k == "artist"
               else ("Агата Кристи — X", None, None)):
        resp = admin_client.post("/api/admin/users/target/showcase/refresh")
    assert resp.json()["changed"] == ["favorite_artist", "favorite_track"]

    assert admin_client.post("/api/admin/users/target/showcase/unlock", json={"field": "track"}).status_code == 200
    profile = _session(lambda s: s.query(UserProfile).join(User).filter(User.username == "target").one())
    assert profile.favorite_track == "Агата Кристи — X"
    assert profile.favorite_artist_cover == "https://img/a.jpg"
    assert profile.favorite_track_updated_at is None
    assert profile.favorite_artist_updated_at is not None
    assert admin_client.post("/api/admin/users/target/showcase/unlock", json={"field": "all"}).status_code == 200
    assert admin_client.post("/api/admin/users/target/showcase/unlock", json={"field": "x"}).status_code == 422
    assert admin_client.post("/api/admin/users/ghost/showcase/refresh").status_code == 404


# --- reports --------------------------------------------------------------------------

def _comment_by(author, text="плохой комментарий"):
    from app.models import Scrobble, ScrobbleComment, Track

    def run(s):
        user = s.query(User).filter(User.username == author).one()
        track = Track(title="T", artist="A", duration=100)
        s.add(track)
        s.flush()
        scrobble = Scrobble(user_id=user.id, track_id=track.id, source="api", listened_sec=100)
        s.add(scrobble)
        s.flush()
        comment = ScrobbleComment(user_id=user.id, scrobble_id=scrobble.id, content=text)
        s.add(comment)
        s.commit()
        return comment.id
    return _session(run)


def test_users_report_profiles_and_comments(admin_client):
    comment_id = _comment_by("target")
    _login(admin_client, "other")
    ok = admin_client.post("/api/reports", json={"target_type": "user", "username": "target",
                                                 "reason": "cheating", "details": "  накрутка  "})
    assert ok.json() == {"status": "ok"}
    # The same open report twice is not stored again
    again = admin_client.post("/api/reports", json={"target_type": "user", "username": "target",
                                                    "reason": "spam"})
    assert again.json() == {"status": "already_reported"}
    assert admin_client.post("/api/reports", json={"target_type": "comment", "comment_id": comment_id,
                                                   "reason": "abuse"}).json() == {"status": "ok"}

    assert admin_client.post("/api/reports", json={"target_type": "user", "username": "other",
                                                   "reason": "spam"}).status_code == 400
    assert admin_client.post("/api/reports", json={"target_type": "user", "username": "ghost",
                                                   "reason": "spam"}).status_code == 404
    assert admin_client.post("/api/reports", json={"target_type": "comment", "comment_id": 999999,
                                                   "reason": "spam"}).status_code == 404
    assert admin_client.post("/api/reports", json={"target_type": "user", "reason": "spam"}).status_code == 422
    assert admin_client.post("/api/reports", json={"target_type": "user", "username": "target",
                                                   "reason": "because"}).status_code == 422
    admin_client.cookies.clear()
    assert admin_client.post("/api/reports", json={"target_type": "user", "username": "target",
                                                   "reason": "spam"}).status_code == 401


def test_admin_resolves_reports(admin_client):
    from app.models import Report, ScrobbleComment

    comment_id = _comment_by("target")
    for reporter in ("other", "boss"):
        _login(admin_client, reporter)
        admin_client.post("/api/reports", json={"target_type": "comment", "comment_id": comment_id,
                                                "reason": "abuse"})
    admin_client.post("/api/reports", json={"target_type": "user", "username": "target", "reason": "spam"})

    page = admin_client.get("/api/admin/reports").json()
    assert page["open_count"] == 3
    comment_reports = [r for r in page["items"] if r["type"] == "comment"]
    assert len(comment_reports) == 2
    first = comment_reports[0]
    assert first["comment"] == {"id": comment_id, "text": "плохой комментарий", "exists": True}
    assert first["target"]["username"] == "target"
    assert first["target_open_reports"] == 3
    assert admin_client.get("/api/admin/reports?target_type=user").json()["total"] == 1

    # Closing one closes the other open report about the same comment
    done = admin_client.post(f"/api/admin/reports/{first['id']}/resolve",
                             json={"status": "resolved", "resolution": "удалён", "delete_comment": True}).json()
    assert done == {"status": "ok", "closed": 2, "comment_deleted": True}
    assert _session(lambda s: s.get(ScrobbleComment, comment_id)) is None
    # The report stays readable after the comment is gone
    resolved = admin_client.get("/api/admin/reports?status=resolved").json()["items"]
    assert {r["comment"]["exists"] for r in resolved} == {False}
    assert {r["comment"]["text"] for r in resolved} == {"плохой комментарий"}
    assert resolved[0]["resolved_by"] == "boss"

    profile_report = admin_client.get("/api/admin/reports").json()["items"][0]
    assert admin_client.post(f"/api/admin/reports/{profile_report['id']}/resolve",
                             json={"status": "dismissed"}).json()["closed"] == 1
    assert admin_client.get("/api/admin/reports").json()["open_count"] == 0
    assert _session(lambda s: s.query(Report).filter(Report.status == "dismissed").count()) == 1
    assert admin_client.post("/api/admin/reports/999999/resolve", json={"status": "resolved"}).status_code == 404
    assert admin_client.post(f"/api/admin/reports/{first['id']}/resolve",
                             json={"status": "open"}).status_code == 422
    actions = {e["action"] for e in admin_client.get("/api/admin/audit").json()["items"]}
    assert {"report.resolve", "comment.delete"} <= actions

    _login(admin_client, "other")
    assert admin_client.get("/api/admin/reports").status_code == 403
