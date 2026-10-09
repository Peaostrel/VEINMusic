"""Link previews and the sitemap expose only what an anonymous visitor may see."""

import json
from datetime import UTC, datetime

import pytest

from app.models import Scrobble, Track, User, UserIntegration, UserProfile
from app.routers import preview
from app.services.cache import clear_all

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
WEBP_BYTES = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 16


@pytest.fixture(autouse=True)
def _fresh_cache():
    clear_all()
    yield
    clear_all()


def _user(db, username, *, private=False, banned=False, privacy=None, avatar=None):
    user = User(username=username, hashed_password="x", is_banned=banned)
    preferences = json.dumps({"privacy": privacy}) if privacy else None
    user.profile = UserProfile(
        is_private=private,
        display_name=f"{username} name",
        bio="Слушаю всё подряд",
        avatar_url=avatar,
        preferences=preferences,
    )
    user.integration = UserIntegration()
    db.add(user)
    db.flush()
    return user


def _play(db, user, track, times=1):
    for _ in range(times):
        db.add(Scrobble(
            user_id=user.id,
            track_id=track.id,
            played_at=datetime.now(UTC),
            listened_sec=track.duration,
            source="yandex",
        ))


def _track(db, title, artist, cover=None):
    track = Track(title=title, artist=artist, duration=200, cover_url=cover)
    db.add(track)
    db.flush()
    return track


def test_user_preview_shows_public_stats(client, db):
    user = _user(db, "preview_open")
    kino = _track(db, "Группа крови", "Кино")
    _play(db, user, kino, 3)
    _play(db, user, _track(db, "Кукушка", "Другой"), 1)
    db.commit()

    data = client.get("/api/preview/user/preview_open").json()
    assert data["display_name"] == "preview_open name"
    assert data["scrobbles"] == 4
    assert data["top_artist"] == "Кино"
    assert data["indexable"] is True
    assert data["level"] is not None


def test_user_preview_of_private_profile_has_only_the_name(client, db):
    user = _user(db, "preview_private", private=True)
    _play(db, user, _track(db, "Тайна", "Скрытый"), 2)
    db.commit()

    data = client.get("/api/preview/user/preview_private").json()
    assert data["display_name"] == "preview_private name"
    assert data["is_private"] is True
    assert data["indexable"] is False
    assert data["scrobbles"] is None
    assert data["top_artist"] is None
    assert data["bio"] is None


def test_user_preview_hides_statistics_closed_to_strangers(client, db):
    user = _user(db, "preview_followers", privacy={"statistics": "followers", "search_indexing": False})
    _play(db, user, _track(db, "Закрыто", "Артист"), 1)
    db.commit()

    data = client.get("/api/preview/user/preview_followers").json()
    assert data["scrobbles"] is None
    assert data["top_artist"] is None
    assert data["indexable"] is False


def test_banned_and_missing_users_have_no_preview(client, db):
    _user(db, "preview_banned", banned=True)
    db.commit()
    assert client.get("/api/preview/user/preview_banned").status_code == 404
    assert client.get("/api/preview/user/preview_nobody").status_code == 404


def test_artist_and_track_previews_count_public_plays_only(client, db):
    public = _user(db, "preview_fan")
    hidden = _user(db, "preview_hidden_fan", private=True)
    track = _track(db, "Звезда", "Preview Artist", cover="https://example.com/c.png")
    _play(db, public, track, 2)
    _play(db, hidden, track, 5)
    secret = _track(db, "Секрет", "Secret Artist")
    _play(db, hidden, secret, 1)
    db.commit()

    artist = client.get("/api/preview/artist/preview artist").json()
    assert artist == {
        "name": "Preview Artist",
        "plays": 2,
        "tracks": 1,
        "top_track": "Звезда",
        "has_cover": True,
    }
    detail = client.get(f"/api/preview/track/{track.id}").json()
    assert detail["plays"] == 2
    assert detail["title"] == "Звезда"
    assert client.get("/api/preview/artist/Secret Artist").status_code == 404
    assert client.get(f"/api/preview/track/{secret.id}").status_code == 404


def test_preview_image_serves_only_drawable_formats(client, db, monkeypatch):
    _user(db, "preview_png", avatar="https://cdn.example.com/a.png")
    _user(db, "preview_webp", avatar="https://cdn.example.com/a.webp")
    _user(db, "preview_noavatar")
    db.commit()
    fetched = []

    async def fake_download(url):
        fetched.append(url)
        return WEBP_BYTES if url.endswith(".webp") else PNG_BYTES

    monkeypatch.setattr(preview, "_download", fake_download)

    response = client.get("/api/preview/user/preview_png/image")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == PNG_BYTES
    assert client.get("/api/preview/user/preview_webp/image").status_code == 404
    assert client.get("/api/preview/user/preview_noavatar/image").status_code == 404
    assert client.get("/api/preview/other/x/image").status_code == 404
    assert fetched == ["https://cdn.example.com/a.png", "https://cdn.example.com/a.webp"]


def test_preview_image_reads_uploads_from_disk(client, db, monkeypatch, tmp_path):
    (tmp_path / "avatar.png").write_bytes(PNG_BYTES)
    monkeypatch.setattr(preview, "UPLOADS_DIR", str(tmp_path))
    monkeypatch.setattr(preview, "API_BASE_URL", "https://api.example.com")

    async def no_download(url):
        raise AssertionError(f"uploads must not be fetched over the network: {url}")

    monkeypatch.setattr(preview, "_download", no_download)
    _user(db, "preview_upload", avatar="https://api.example.com/uploads/avatar.png")
    _user(db, "preview_traversal", avatar="https://api.example.com/uploads/..%2F..%2Fetc%2Fpasswd")
    db.commit()

    assert client.get("/api/preview/user/preview_upload/image").content == PNG_BYTES
    assert client.get("/api/preview/user/preview_traversal/image").status_code == 404


def test_preview_image_refuses_internal_addresses(client, db):
    _user(db, "preview_ssrf", avatar="http://127.0.0.1:8000/admin.png")
    db.commit()
    assert client.get("/api/preview/user/preview_ssrf/image").status_code == 404


def test_sitemap_lists_only_public_indexable_content(client, db):
    shown = _user(db, "sitemap_shown")
    unlisted = _user(db, "sitemap_unlisted", privacy={"search_indexing": False})
    private = _user(db, "sitemap_private", private=True)
    banned = _user(db, "sitemap_banned", banned=True)
    _user(db, "sitemap_silent")  # no plays: nothing to show
    public_track = _track(db, "Открытый", "Sitemap Artist")
    private_track = _track(db, "Закрытый", "Sitemap Hidden")
    _play(db, shown, public_track)
    _play(db, unlisted, public_track)
    _play(db, private, private_track)
    _play(db, banned, private_track)
    db.commit()

    data = client.get("/api/preview/sitemap").json()
    usernames = {user["username"] for user in data["users"]}
    assert "sitemap_shown" in usernames
    assert not usernames & {"sitemap_unlisted", "sitemap_private", "sitemap_banned", "sitemap_silent"}
    assert "Sitemap Artist" in data["artists"]
    assert "Sitemap Hidden" not in data["artists"]
    track_ids = {track["id"] for track in data["tracks"]}
    assert public_track.id in track_ids
    assert private_track.id not in track_ids


def test_profile_edit_refreshes_the_preview(client, db):
    response = client.post(
        "/auth/register",
        json={"username": "preview_editor", "password": "preview-test-password"},
    )
    assert response.status_code == 200, response.text
    assert client.get("/api/preview/user/preview_editor").json()["display_name"] == "preview_editor"

    update = client.post(
        "/api/profile/update",
        headers={"Origin": "http://localhost:3000"},
        json={"display_name": "Новое имя"},
    )
    assert update.status_code == 200, update.text
    assert client.get("/api/preview/user/preview_editor").json()["display_name"] == "Новое имя"
