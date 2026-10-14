"""Site audit: hot reads cached without stale listening, browser caching,
and profile texts."""
from datetime import UTC, datetime, timedelta

from sqlalchemy import event

from app.database import engine
from app.models import Scrobble, Track, User, UserIntegration, UserProfile


def _listener(db, name="cache_listener"):
    user = User(username=name, hashed_password="x", profile=UserProfile(), integration=UserIntegration())
    db.add(user)
    db.flush()
    return user


def _play(db, user, title, minutes_ago=5):
    track = Track(title=title, artist="Cache Artist", duration=180)
    db.add(track)
    db.flush()
    when = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    row = Scrobble(user_id=user.id, track_id=track.id, source="plat", listened_sec=180,
                   is_playing=False, played_at=when, updated_at=when)
    db.add(row)
    db.commit()
    return row


class _Queries:
    def __init__(self):
        self.count = 0

    def __enter__(self):
        event.listen(engine, "before_cursor_execute", self._hit)
        return self

    def __exit__(self, *exc):
        event.remove(engine, "before_cursor_execute", self._hit)

    def _hit(self, *args):
        self.count += 1


def test_detailed_stats_reuse_and_refresh_on_listening_changes(client, db):
    user = _listener(db)
    first = _play(db, user, "One")
    url = f"/api/detailed-stats/{user.username}?period=7d"
    assert client.get(url).json()["total_scrobbles"] == 1
    with _Queries() as cold_again:
        assert client.get(url).json()["total_scrobbles"] == 1
    assert cold_again.count <= 4  # visibility + version, not the ~17 aggregates

    _play(db, user, "Two")
    assert client.get(url).json()["total_scrobbles"] == 2
    first.excluded_from_stats = True
    db.commit()
    assert client.get(url).json()["total_scrobbles"] == 1
    first.excluded_from_stats = False
    db.commit()
    assert client.get(url).json()["total_scrobbles"] == 2


def test_global_feed_is_built_once_per_window_and_rechecks_privacy(client, db):
    user = _listener(db, "feed_listener")
    _play(db, user, "Feed song")
    assert [item["title"] for item in client.get("/api/feed/global").json()["feed"]] == ["Feed song"]
    with _Queries() as warm:
        client.get("/api/feed/global")
    assert warm.count <= 1  # only the privacy recheck
    user.profile.is_private = True
    db.commit()
    assert client.get("/api/feed/global").json()["feed"] == []


def test_uploads_are_cached_by_browsers(client, monkeypatch, tmp_path):
    import app.routers.media as media
    monkeypatch.setattr(media, "UPLOADS_DIR", str(tmp_path))
    (tmp_path / "0123456789abcdef0123456789abcdef.jpg").write_bytes(b"\xFF\xD8\xFFjpeg")
    response = client.get("/uploads/0123456789abcdef0123456789abcdef.jpg")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_month_badge_needs_5000_minutes_not_seconds(client, db):
    user = _listener(db, "badge_listener")
    for index in range(30):  # 30 x 3 min = 90 minutes, above 5000 seconds
        _play(db, user, f"Badge {index}", minutes_ago=5 + index)
    status = client.get(f"/api/stats/wrapped?username={user.username}").json()["status"]
    assert status == "Активный слушатель"
