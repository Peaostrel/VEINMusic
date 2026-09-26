"""Admin panel endpoints: moderation, antifraud, catalog, gamification,
announcements, feature flags, blacklist, jobs and system metrics."""
from unittest.mock import AsyncMock, patch

import pytest

from app.core.security import create_session_token
from app.database import SessionLocal
from app.models import (
    LastfmImportJob,
    Scrobble,
    Track,
    TrackAlias,
    User,
    UserIntegration,
)
from app.routers import admin as admin_router


@pytest.fixture
def admin_client(client, db):
    client.headers["Origin"] = "http://localhost:3000"
    client.post("/auth/register", json={"username": "boss", "password": "password"})
    client.post("/auth/register", json={"username": "target", "password": "password"})
    boss = db.query(User).filter(User.username == "boss").first()
    boss.role = "admin"
    db.commit()
    client.cookies.clear()
    client.cookies.set("api_key", create_session_token(str(boss.id), str(boss.hashed_password)))
    return client


def _fresh(query):
    s = SessionLocal()
    try:
        return query(s)
    finally:
        s.close()


def _target():
    return _fresh(lambda s: s.query(User).filter(User.username == "target").one())


def _add_scrobbles(username, artist="Band", title="Song", count=2):
    s = SessionLocal()
    try:
        user = s.query(User).filter(User.username == username).one()
        track = Track(title=title, artist=artist, duration=200)
        s.add(track)
        s.flush()
        for _ in range(count):
            s.add(Scrobble(user_id=user.id, track_id=track.id, source="yandex", is_playing=False, xp_earned=5))
        s.commit()
        return track.id
    finally:
        s.close()


def test_regular_user_is_rejected(client):
    client.headers["Origin"] = "http://localhost:3000"
    client.post("/auth/register", json={"username": "pleb", "password": "password"})
    for path in ("/api/admin/stats", "/api/admin/frames", "/api/admin/system/analytics"):
        assert client.get(path).status_code == 403


def test_stats_lists_users_with_xp(admin_client):
    _add_scrobbles("target")
    data = admin_client.get("/api/admin/stats").json()
    target = next(u for u in data["users"] if u["username"] == "target")
    assert target["scrobbles"] == 2
    assert target["total_xp"] == 10
    assert data["total_tracks"] == 1
    assert len(data["achievements"]) >= 1


def test_antifraud_reset_and_unflag(admin_client):
    _add_scrobbles("target")
    res = admin_client.post("/api/admin/antifraud/target/reset-xp")
    assert res.status_code == 200
    target = _target()
    assert target.is_flagged_antifraud is True
    assert "@boss" in target.antifraud_reason
    assert _fresh(lambda s: s.query(Scrobble).filter(Scrobble.xp_earned != 0).count()) == 0

    suspicious = admin_client.get("/api/admin/antifraud/suspicious").json()["suspicious_users"]
    assert [u["username"] for u in suspicious] == ["target"]

    assert admin_client.post("/api/admin/antifraud/target/unflag").status_code == 200
    target = _target()
    assert target.is_flagged_antifraud is False
    assert target.antifraud_reason is None

    assert admin_client.post("/api/admin/antifraud/ghost/reset-xp").status_code == 404
    assert admin_client.post("/api/admin/antifraud/ghost/unflag").status_code == 404


def test_ban_and_unban(admin_client):
    version = _target().session_version
    assert admin_client.post("/api/admin/users/target/ban", json={"is_banned": True}).json()["is_banned"] is True
    target = _target()
    assert target.is_banned is True
    assert target.session_version > version  # sessions revoked
    assert admin_client.post("/api/admin/users/target/ban", json={"is_banned": False}).json()["is_banned"] is False
    assert admin_client.post("/api/admin/users/ghost/ban", json={"is_banned": True}).status_code == 404


def test_cannot_ban_another_admin(admin_client):
    admin_client.post("/api/admin/users/target/role", json={"role": "admin"})
    assert admin_client.post("/api/admin/users/target/ban", json={"is_banned": True}).status_code == 400


def test_roles(admin_client):
    assert admin_client.post("/api/admin/users/target/role", json={"role": "moderator"}).json()["role"] == "moderator"
    assert admin_client.post("/api/admin/users/target/role", json={"role": "god"}).status_code == 400
    assert admin_client.post("/api/admin/users/ghost/role", json={"role": "user"}).status_code == 404


def test_reset_profile(admin_client):
    s = SessionLocal()
    try:
        user = s.query(User).filter(User.username == "target").one()
        user.profile.avatar_url = "https://x/a.png"
        user.profile.display_name = "Bad name"
        s.commit()
    finally:
        s.close()
    assert admin_client.post("/api/admin/users/target/reset-profile").status_code == 200
    profile = _fresh(lambda s: s.query(User).filter(User.username == "target").one().profile)
    assert profile.avatar_url is None
    assert profile.display_name == "target"
    assert admin_client.post("/api/admin/users/ghost/reset-profile").status_code == 404


def test_delete_user_rules(admin_client):
    assert admin_client.delete("/api/admin/users/boss").status_code == 400
    assert admin_client.delete("/api/admin/users/ghost").status_code == 404
    assert admin_client.delete("/api/admin/users/target").status_code == 200
    assert _fresh(lambda s: s.query(User).filter(User.username == "target").count()) == 0


def test_merge_tracks(admin_client):
    source = _add_scrobbles("target", title="Song (Remastered)", count=3)
    target = _add_scrobbles("target", title="Song", count=1)
    res = admin_client.post("/api/admin/catalog/merge",
                            json={"source_track_id": source, "target_track_id": target})
    assert res.status_code == 200
    assert res.json()["reassigned_scrobbles"] == 3
    assert _fresh(lambda s: s.query(Scrobble).filter(Scrobble.track_id == target).count()) == 4
    alias = _fresh(lambda s: s.query(TrackAlias).one())
    assert alias.original_title == "Song (Remastered)"
    assert alias.canonical_track_id == target

    assert admin_client.post("/api/admin/catalog/merge",
                             json={"source_track_id": target, "target_track_id": target}).status_code == 400
    assert admin_client.post("/api/admin/catalog/merge",
                             json={"source_track_id": source, "target_track_id": target}).status_code == 404


def test_merge_artists(admin_client):
    _add_scrobbles("target", artist="Korol i Shut")
    _add_scrobbles("target", artist="korol i shut", title="Other")
    res = admin_client.post("/api/admin/catalog/merge",
                            json={"source_artist": "Korol i Shut", "target_artist": "Король и Шут"})
    assert res.status_code == 200
    assert _fresh(lambda s: {t.artist for t in s.query(Track).all()}) == {"Король и Шут"}
    assert admin_client.post("/api/admin/catalog/merge",
                             json={"source_artist": "A", "target_artist": "a"}).status_code == 400
    assert admin_client.post("/api/admin/catalog/merge", json={}).status_code == 400


def test_cache_flush(admin_client):
    from app.services import cache
    cache.set_to_cache("leaderboard_test", {"x": 1})
    res = admin_client.post("/api/admin/cache/flush")
    assert res.status_code == 200
    assert res.json()["removed"] >= 1
    assert cache.get_from_cache("leaderboard_test") is None
    with patch.object(admin_router.cache, "clear_all", side_effect=ConnectionError("down")):
        assert admin_client.post("/api/admin/cache/flush").status_code == 500


def test_frames_crud(admin_client):
    res = admin_client.post("/api/admin/frames", json={"name": "Gold", "code": "gold", "required_level": 10})
    frame_id = res.json()["frame"]["id"]
    assert admin_client.post("/api/admin/frames", json={"name": "Dup", "code": "gold"}).status_code == 400

    res = admin_client.put(f"/api/admin/frames/{frame_id}", json={
        "name": "Golden", "code": "golden", "css_style": "x", "image_url": "/uploads/a.png",
        "rarity": "epic", "required_level": 20, "is_active": False})
    frame = res.json()["frame"]
    assert (frame["name"], frame["code"], frame["rarity"], frame["required_level"], frame["is_active"]) == \
        ("Golden", "golden", "epic", 20, False)
    assert [f["code"] for f in admin_client.get("/api/admin/frames").json()["frames"]] == ["golden"]

    assert admin_client.delete(f"/api/admin/frames/{frame_id}").status_code == 200
    assert admin_client.put(f"/api/admin/frames/{frame_id}", json={}).status_code == 404
    assert admin_client.delete(f"/api/admin/frames/{frame_id}").status_code == 404


def test_xp_multiplier(admin_client):
    assert admin_client.get("/api/admin/economy/multiplier").json() == {"multiplier": 1.0}
    assert admin_client.post("/api/admin/economy/multiplier", json={"multiplier": 2.5}).json()["multiplier"] == 2.5
    assert admin_client.get("/api/admin/economy/multiplier").json() == {"multiplier": 2.5}
    assert admin_client.post("/api/admin/economy/multiplier", json={"multiplier": 50}).status_code == 422


def test_system_health_and_analytics(admin_client):
    _add_scrobbles("target")
    s = SessionLocal()
    try:
        target = s.query(User).filter(User.username == "target").one()
        integration = s.query(UserIntegration).filter_by(user_id=target.id).first()
        if integration is None:
            integration = UserIntegration(user_id=target.id)
            s.add(integration)
        integration.yandex_token = "token"
        s.commit()
    finally:
        s.close()

    health = admin_client.get("/api/admin/system/health").json()
    assert health["status"] == "healthy"
    assert health["database"]["scrobbles"] == 2
    assert health["cloud_scrobblers"]["yandex_users"] == 1

    analytics = admin_client.get("/api/admin/system/analytics").json()
    assert analytics["dau"] == 1
    assert analytics["mau"] == 1
    assert analytics["scrobbles_24h"] == 2
    assert analytics["source_distribution"] == {"yandex": 2}


def test_announcements_crud(admin_client):
    ann = admin_client.post("/api/admin/announcements", json={"title": "Hi", "message": "Hello"}).json()["announcement"]
    res = admin_client.put(f"/api/admin/announcements/{ann['id']}",
                           json={"title": "Hey", "message": "Updated", "type": "warning", "is_active": False})
    updated = res.json()["announcement"]
    assert (updated["title"], updated["message"], updated["type"], updated["is_active"]) == \
        ("Hey", "Updated", "warning", False)
    assert len(admin_client.get("/api/admin/announcements").json()["announcements"]) == 1
    assert admin_client.delete(f"/api/admin/announcements/{ann['id']}").status_code == 200
    assert admin_client.put(f"/api/admin/announcements/{ann['id']}", json={}).status_code == 404
    assert admin_client.delete(f"/api/admin/announcements/{ann['id']}").status_code == 404


def test_feature_flags_crud(admin_client):
    assert admin_client.post("/api/admin/feature-flags", json={"key": "beta"}).status_code == 200
    assert admin_client.post("/api/admin/feature-flags", json={"key": "beta"}).status_code == 400
    res = admin_client.put("/api/admin/feature-flags/beta", json={"is_enabled": False, "description": "Off"})
    assert res.json()["feature_flag"]["is_enabled"] is False
    assert res.json()["feature_flag"]["description"] == "Off"
    assert [f["key"] for f in admin_client.get("/api/admin/feature-flags").json()["feature_flags"]] == ["beta"]
    assert admin_client.delete("/api/admin/feature-flags/beta").status_code == 200
    assert admin_client.put("/api/admin/feature-flags/beta", json={"is_enabled": True}).status_code == 404
    assert admin_client.delete("/api/admin/feature-flags/beta").status_code == 404


def test_blacklist_crud(admin_client):
    created = admin_client.post("/api/admin/catalog/blacklist", json={"pattern": "white noise"}).json()["filter"]
    assert created["filter_type"] == "keyword"
    assert len(admin_client.get("/api/admin/catalog/blacklist").json()["filters"]) == 1
    assert admin_client.delete(f"/api/admin/catalog/blacklist/{created['id']}").status_code == 200
    assert admin_client.delete(f"/api/admin/catalog/blacklist/{created['id']}").status_code == 404


def test_lastfm_jobs_list_and_retry(admin_client):
    s = SessionLocal()
    try:
        target = s.query(User).filter(User.username == "target").one()
        failed = LastfmImportJob(user_id=target.id, lastfm_username="fm", status="failed", error_log="boom")
        done = LastfmImportJob(user_id=target.id, lastfm_username="fm", status="completed")
        s.add_all([failed, done])
        s.commit()
        failed_id, done_id = failed.id, done.id
    finally:
        s.close()

    assert len(admin_client.get("/api/admin/jobs/lastfm").json()["jobs"]) == 2
    with patch("app.services.lastfm_import.enqueue_import", new=AsyncMock()) as enqueue:
        assert admin_client.post(f"/api/admin/jobs/lastfm/{failed_id}/retry").status_code == 200
        enqueue.assert_awaited_once_with(failed_id)
        assert admin_client.post(f"/api/admin/jobs/lastfm/{done_id}/retry").status_code == 400
        assert admin_client.post("/api/admin/jobs/lastfm/999999/retry").status_code == 404
    job = _fresh(lambda s: s.query(LastfmImportJob).filter_by(id=failed_id).one())
    assert job.status == "pending"
    assert job.error_log is None


def test_together_rooms(admin_client):
    assert admin_client.get("/api/admin/together/rooms").json() == {"rooms": []}


def test_cli_set_role(admin_client, capsys):
    from app import cli
    assert cli.main(["set-role", "target", "moderator"]) == 0
    assert _target().role == "moderator"
    assert "role set to moderator" in capsys.readouterr().out
    assert cli.main(["set-role", "ghost", "admin"]) == 1
    with pytest.raises(SystemExit):
        cli.main(["set-role", "target", "god"])
    with pytest.raises(ValueError):
        cli.set_role("target", "god")
