"""Artwork remains usable across the partner's same-site boundary."""
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import text

from app.core.cover_urls import public_cover_url
from app.core.safe_http import UnsafeURLError
from app.models import Achievement, Track, User
from app.services.achievements import _format_achievement_data

COVER_PATH = "albums/e243422d-6c75-4aa6-a2f8-ab6879e027e9.jpg"
UPSTREAM = f"https://plat-music.ru/api/media/covers/{COVER_PATH}?w=512"
PROXY_PATH = f"/api/media/plat-covers/{COVER_PATH}"
WEBP = b"RIFF\x10\x00\x00\x00WEBP" + b"test-image"


def test_existing_track_and_scalar_queries_return_proxy_without_changing_sql(db, monkeypatch):
    monkeypatch.setenv("API_BASE_URL", "https://api.music.vein.guru")
    track = Track(title="Partner artwork", artist="Artist", cover_url=UPSTREAM)
    db.add(track)
    db.commit()
    db.expire_all()
    assert db.query(Track).one().cover_url == "https://api.music.vein.guru" + PROXY_PATH
    assert db.query(Track.cover_url).scalar() == "https://api.music.vein.guru" + PROXY_PATH
    assert db.execute(text("SELECT cover_url FROM tracks")).scalar() == UPSTREAM


def test_achievement_returns_partner_artwork_through_proxy(db, monkeypatch):
    monkeypatch.setenv("API_BASE_URL", "https://api.music.vein.guru")
    user = User(username="achievement_cover", hashed_password="x")
    achievement = Achievement(
        name="Partner track", description="Listen", icon="🏆",
        rule_type="manual", rule_value=1, target_image=UPSTREAM, reward_xp=50)
    db.add_all([user, achievement])
    db.commit()
    result = _format_achievement_data(db, user, achievement, None, 1)
    assert result["target_image"] == "https://api.music.vein.guru" + PROXY_PATH


def test_proxy_serves_webp_without_partner_security_headers(client, monkeypatch):
    download = AsyncMock(return_value=WEBP)
    monkeypatch.setattr("app.routers.media.pinned_download", download)
    response = client.get(PROXY_PATH)
    assert response.status_code == 200
    assert response.content == WEBP
    assert response.headers["content-type"] == "image/webp"
    assert response.headers["cache-control"] == "public, max-age=3600"
    assert "cross-origin-resource-policy" not in response.headers
    assert "set-cookie" not in response.headers
    download.assert_awaited_once_with(UPSTREAM, max_bytes=2 * 1024 * 1024)


@pytest.mark.parametrize("content", [None, b"<html>login</html>", b"<svg>script</svg>"])
def test_non_images_and_oversized_downloads_are_refused(client, monkeypatch, content):
    monkeypatch.setattr("app.routers.media.pinned_download", AsyncMock(return_value=content))
    assert client.get(PROXY_PATH).status_code == 404


@pytest.mark.parametrize("error", [TimeoutError(), UnsafeURLError("private address")])
def test_network_failures_are_bounded(client, monkeypatch, error):
    monkeypatch.setattr("app.routers.media.pinned_download", AsyncMock(side_effect=error))
    assert client.get(PROXY_PATH).status_code == 502


@pytest.mark.parametrize("path", ["https://127.0.0.1/a.jpg", "albums/not-a-cover.jpg", "secret/file.jpg"])
def test_proxy_never_accepts_arbitrary_urls_or_paths(client, monkeypatch, path):
    download = AsyncMock(return_value=WEBP)
    monkeypatch.setattr("app.routers.media.pinned_download", download)
    assert client.get("/api/media/plat-covers/" + path).status_code == 404
    download.assert_not_called()


@pytest.mark.parametrize("value", [
    None,
    "",
    "https://avatars.yandex.net/a.jpg",
    "https://plat-music.ru.evil.test/api/media/covers/" + COVER_PATH,
    "https://plat-music.ru/private/avatar.jpg",
])
def test_other_urls_are_preserved(value):
    assert public_cover_url(value) == value


def test_recommendations_proxy_partner_artwork(client, db, monkeypatch):
    """The raw SQL behind recommendations bypasses the column type."""
    from app.models import Scrobble, User, UserIntegration, UserProfile
    monkeypatch.setenv("API_BASE_URL", "https://api.music.vein.guru")
    me, twin = (User(username=name, hashed_password="x", profile=UserProfile(),
                     integration=UserIntegration()) for name in ("cover_me", "cover_twin"))
    track = Track(title="Partner artwork", artist="Partner Artist", cover_url=UPSTREAM, duration=180)
    db.add_all([me, twin, track])
    db.flush()
    db.add(Scrobble(user_id=twin.id, track_id=track.id, source="plat", listened_sec=180))
    db.commit()
    monkeypatch.setattr("app.routers.discovery.get_taste_twins",
                        lambda username, db: [{"username": "cover_twin"}])
    recs = client.get("/api/recommendations", params={"username": "cover_me"}).json()
    assert recs == [{"artist": "Partner Artist", "cover_url": "https://api.music.vein.guru" + PROXY_PATH,
                     "reason": "Слушают ваши вкусовые близнецы"}]
