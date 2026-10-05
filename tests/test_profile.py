import json
from unittest.mock import AsyncMock, patch
import pytest
from app.core.security import create_session_token
from app.database import SessionLocal
from app.models import User


@pytest.fixture
def auth_client(client):
    client.post("/auth/register", json={
        "username": "profileuser",
        "password": "password123"
    })
    client.headers["Origin"] = "http://localhost:3000"
    yield client


@pytest.fixture
def auth_user(db, auth_client):
    db.close()
    db = SessionLocal()
    return db.query(User).filter(User.username == "profileuser").first()


def test_update_profile_success(auth_client, db, auth_user):
    payload = {
        "theme": "glassmorphism",
        "display_name": "My Nice Name",
        "bio": "Music enthusiast",
        "location": "Moscow",
        "favorite_genre": "Synthwave",
        "equipment": "Sennheiser HD600",
        "favorite_artist": "Король и Шут",
        "favorite_track": "Кукла колдуна",
        "favorite_album": "Акустический альбом",
        "is_private": True,
        "hidden_artists": "Pop Artist"
    }

    with patch("app.routers.profile.search_metadata", return_value=("Mock Name", "Mock Cover", "Mock URL")):
        resp = auth_client.post(
            "/api/profile/update",
            json=payload,
            headers={
                "Origin": "http://localhost:3000"})
        assert resp.status_code == 200

    db.close()
    db = SessionLocal()
    updated_user = db.query(User).filter(
        User.username == auth_user.username).first()
    assert updated_user.profile.theme == "glassmorphism"
    assert updated_user.profile.display_name == "My Nice Name"
    assert updated_user.profile.bio == "Music enthusiast"
    assert updated_user.profile.favorite_artist == "Mock Name"
    assert updated_user.profile.is_private is True
    assert updated_user.profile.hidden_artists == "Pop Artist"


def test_update_profile_validation_urls(auth_client):
    # Bad avatar URL
    payload = {"avatar_url": "invalid://bad-url.com"}
    resp = auth_client.post("/api/profile/update", json=payload)
    assert resp.status_code == 400
    assert "Invalid URL" in resp.text

    # Bad cover URL
    payload = {"cover_url": "javascript:alert(1)"}
    resp = auth_client.post("/api/profile/update", json=payload)
    assert resp.status_code == 400
    assert "Invalid URL" in resp.text


def test_update_privacy(auth_client, db, auth_user):
    resp = auth_client.post(
        "/api/profile/privacy",
        json={
            "is_private": True,
            "hidden_artists": "artist1, artist2"})
    assert resp.status_code == 200
    db.close()
    db = SessionLocal()
    updated_user = db.query(User).filter(
        User.username == auth_user.username).first()
    assert updated_user.profile.is_private is True
    assert updated_user.profile.hidden_artists == "artist1, artist2"


def test_generate_api_key(auth_client, db, auth_user):
    resp = auth_client.post("/api/profile/apikey/generate")
    assert resp.status_code == 200
    data = resp.json()
    assert "api_key" in data
    raw_key = data["api_key"]

    db.close()
    db = SessionLocal()
    updated_user = db.query(User).filter(
        User.username == auth_user.username).first()
    import hashlib
    from app.core.security import SECRET_KEY
    expected_hash = hashlib.pbkdf2_hmac('sha256', raw_key.encode('utf-8'), SECRET_KEY.encode(), 100000).hex()
    assert updated_user.api_key == expected_hash


def test_csrf_check(client, db):
    client.cookies.clear()
    client.post("/auth/register", json={
        "username": "csrfuser",
        "password": "password123"
    })
    user = db.query(User).filter(User.username == "csrfuser").first()
    token = create_session_token(str(user.id), str(user.hashed_password))
    client.cookies.set("api_key", token)

    # Mutating POST without Origin/Referer should return 403
    resp = client.post("/api/profile/privacy", json={"is_private": True})
    assert resp.status_code == 403
    assert "CSRF verification failed" in resp.text

    # Mutating POST with invalid Origin should return 403
    resp = client.post(
        "/api/profile/privacy",
        json={
            "is_private": True},
        headers={
            "Origin": "https://attacker.com"})
    assert resp.status_code == 403
    assert "CSRF verification failed" in resp.text

    # Mutating POST with allowed Origin should return 200
    resp = client.post(
        "/api/profile/privacy",
        json={
            "is_private": True},
        headers={
            "Origin": "http://localhost:3000"})
    assert resp.status_code == 200


def test_admin_restrictions(client, db):
    client.cookies.clear()
    client.post("/auth/register", json={
        "username": "regular",
        "password": "password"
    })
    client.post("/auth/register", json={
        "username": "adminuser",
        "password": "password"
    })

    regular = db.query(User).filter(User.username == "regular").first()
    admin_user = db.query(User).filter(User.username == "adminuser").first()
    admin_user.role = "admin"
    db.commit()

    # Clear cookies to ensure anonymous request doesn't send registered user's
    # cookie
    client.cookies.clear()
    # Anonymous Access -> 401
    resp = client.get("/api/admin/stats")
    assert resp.status_code == 401

    # Regular User Access -> 403
    regular_token = create_session_token(
        str(regular.id), str(regular.hashed_password))
    client.cookies.set("api_key", regular_token)
    resp = client.get("/api/admin/stats")
    assert resp.status_code == 403

    # Admin User Access -> 200
    client.cookies.clear()
    admin_token = create_session_token(
        str(admin_user.id), str(admin_user.hashed_password))
    client.cookies.set("api_key", admin_token)
    resp = client.get("/api/admin/stats")
    assert resp.status_code == 200


def _profile(username):
    db = SessionLocal()
    try:
        return db.query(User).filter(User.username == username).first().profile
    finally:
        db.close()


def test_saving_settings_twice_with_empty_showcase(auth_client, auth_user):
    """The settings form sends empty favorites as "". That used to count as
    a change against NULL and lock the whole showcase, so the second save
    of a brand-new account failed with "only once in 30 days"."""
    form = {"display_name": "Name", "location": "Россия",
            "favorite_artist": "", "favorite_track": "", "favorite_album": ""}
    assert auth_client.post("/api/profile/update", json=form).status_code == 200

    form["location"] = "Россия, Балашов"
    resp = auth_client.post("/api/profile/update", json=form)
    assert resp.status_code == 200, resp.text

    profile = _profile("profileuser")
    assert profile.location == "Россия, Балашов"
    assert profile.favorite_artist_updated_at is None
    assert profile.favorite_track_updated_at is None
    assert profile.favorite_album_updated_at is None


def test_showcase_lock_is_per_field(auth_client, auth_user):
    with patch("app.routers.profile.search_metadata",
               return_value=("Джизус", None, None)):
        resp = auth_client.post("/api/profile/update", json={
            "favorite_artist": "джизус", "favorite_track": "", "favorite_album": ""})
        assert resp.status_code == 200
        profile = _profile("profileuser")
        assert profile.favorite_artist == "Джизус"
        assert profile.favorite_artist_updated_at is not None
        assert profile.favorite_track_updated_at is None

        # Resending the stored value is not a change
        resp = auth_client.post("/api/profile/update", json={
            "favorite_artist": "Джизус", "favorite_track": "", "favorite_album": ""})
        assert resp.status_code == 200

    # Another field is still free even though the artist is locked
    with patch("app.routers.profile.search_metadata",
               return_value=("Демиург", None, None)):
        resp = auth_client.post("/api/profile/update", json={
            "favorite_artist": "Джизус", "favorite_track": "Демиург", "favorite_album": ""})
        assert resp.status_code == 200
    assert _profile("profileuser").favorite_track == "Демиург"

    # Replacing the locked artist is refused
    resp = auth_client.post("/api/profile/update", json={"favorite_artist": "Other"})
    assert resp.status_code == 400
    assert "30 дней" in resp.json()["detail"]

    # Clearing is allowed and does not start a new lock
    resp = auth_client.post("/api/profile/update", json={"favorite_album": ""})
    assert resp.status_code == 200
    resp = auth_client.post("/api/profile/update", json={"favorite_track": ""})
    assert resp.status_code == 200
    profile = _profile("profileuser")
    assert profile.favorite_track is None


def test_refresh_showcase_keeps_locks(auth_client, auth_user, capsys):
    """Favorites saved with the old search (English name, no artist photo)
    are looked up again without resetting their 30-day locks."""
    from app import cli

    found = {"artist": ("Джизус", "https://img/artist.jpg", "https://deezer/artist"),
             "track": ("Агата Кристи — Ковёр вертолёт", "https://img/track.jpg", None)}
    with patch("app.routers.profile.search_metadata",
               side_effect=lambda value, kind: ("Agatha Christie — Ковёр вертолёт", None, None)
               if kind == "track" else ("Джизус", None, None)):
        auth_client.post("/api/profile/update", json={
            "favorite_artist": "джизус", "favorite_track": "Agatha Christie — Ковёр вертолёт"})
    before = _profile("profileuser")

    with patch("app.routers.profile.search_metadata", side_effect=lambda value, kind: found[kind]):
        assert cli.main(["refresh-showcase", "profileuser"]) == 0
    assert "profileuser: favorite_artist, favorite_track" in capsys.readouterr().out

    after = _profile("profileuser")
    assert after.favorite_artist_cover == "https://img/artist.jpg"
    assert after.favorite_track == "Агата Кристи — Ковёр вертолёт"
    assert after.favorite_track_cover == "https://img/track.jpg"
    assert after.favorite_artist_updated_at == before.favorite_artist_updated_at
    assert after.favorite_track_updated_at == before.favorite_track_updated_at
    assert after.favorite_album is None

    # Nothing new found: nothing changes
    with patch("app.routers.profile.search_metadata", return_value=(None, None, None)):
        assert cli.main(["refresh-showcase"]) == 0
    assert "profileuser: no changes" in capsys.readouterr().out


def test_profile_achievements_carry_their_goal(auth_client, auth_user):
    """The profile shows an achievement's card with links from its goal."""
    from app.models import Achievement, UserAchievement

    db = SessionLocal()
    try:
        ach = Achievement(name="Дух Мира", description="Прослушать [альбом](https://music.yandex.ru/album/1)",
                          icon="🏆", rule_type="specific_album", rule_value=12,
                          rule_target="https://music.yandex.ru/album/1", rule_meta="Джизус — Дух Мира",
                          reward_xp=100)
        db.add(ach)
        db.flush()
        db.add(UserAchievement(user_id=auth_user.id, achievement_id=ach.id))
        db.commit()
    finally:
        db.close()

    shown = auth_client.get("/api/user/profileuser").json()["achievements"]
    card = next(a for a in shown if a["name"] == "Дух Мира")
    assert card["rule_type"] == "specific_album"
    assert card["rule_target"] == "https://music.yandex.ru/album/1"
    assert card["rule_meta"] == "Джизус — Дух Мира"
    assert card["earned_at"]


def test_album_track_details_are_available_only_to_profile_owner(auth_client, auth_user):
    from app.models import Achievement

    db = SessionLocal()
    try:
        achievement = Achievement(
            name="Трек-лист",
            description="Прослушать альбом",
            icon="💿",
            rule_type="specific_album",
            rule_value=2,
            rule_target="https://music.yandex.ru/album/42",
        )
        db.add(achievement)
        db.commit()
        db.refresh(achievement)
        achievement_id = achievement.id
    finally:
        db.close()

    listing = auth_client.get("/api/achievements/all/profileuser")
    card = next(item for item in listing.json()["achievements"] if item["id"] == achievement_id)
    assert card["track_progress_available"] is True

    album_progress = {
        "available": True,
        "tracks": [],
        "listened_count": 0,
        "remaining_count": 2,
        "total_count": 2,
    }
    with patch(
        "app.routers.achievements.get_album_track_progress",
        new=AsyncMock(return_value=album_progress),
    ):
        response = auth_client.get(
            f"/api/achievements/album-progress/profileuser/{achievement_id}"
        )
    assert response.status_code == 200
    assert response.json()["remaining_count"] == 2

    auth_client.cookies.clear()
    listing = auth_client.get("/api/achievements/all/profileuser")
    card = next(item for item in listing.json()["achievements"] if item["id"] == achievement_id)
    assert card["track_progress_available"] is False
    response = auth_client.get(
        f"/api/achievements/album-progress/profileuser/{achievement_id}"
    )
    assert response.status_code == 403


def test_artist_track_details_are_available_only_to_profile_owner(auth_client, auth_user):
    from app.models import Achievement

    db = SessionLocal()
    try:
        achievement = Achievement(
            name="Дискография",
            description="Прослушать треки исполнителя",
            icon="🎤",
            rule_type="specific_artist",
            rule_value=83,
            rule_target="LAZZY2WICE||https://music.yandex.ru/artist/55",
        )
        db.add(achievement)
        db.commit()
        db.refresh(achievement)
        achievement_id = achievement.id
    finally:
        db.close()

    listing = auth_client.get("/api/achievements/all/profileuser")
    card = next(item for item in listing.json()["achievements"] if item["id"] == achievement_id)
    assert card["track_progress_available"] is True

    artist_progress = {
        "available": True,
        "tracks": [],
        "listened_count": 6,
        "remaining_count": 77,
        "total_count": 83,
    }
    with patch(
        "app.routers.achievements.get_artist_track_progress",
        new=AsyncMock(return_value=artist_progress),
    ):
        response = auth_client.get(
            f"/api/achievements/artist-progress/profileuser/{achievement_id}"
        )
    assert response.status_code == 200
    assert response.json()["remaining_count"] == 77

    auth_client.cookies.clear()
    response = auth_client.get(
        f"/api/achievements/artist-progress/profileuser/{achievement_id}"
    )
    assert response.status_code == 403


def test_multi_artist_description_is_expanded_for_profile(auth_client):
    from app.models import Achievement

    db = SessionLocal()
    try:
        achievement = Achievement(
            name="Две дискографии",
            description="Прослушать все треки {artists}",
            icon="🎤",
            rule_type="specific_artist",
            rule_value=5,
            rule_target=json.dumps({
                "mode": "all",
                "artists": [
                    {"name": "Artist A", "url": "https://music.yandex.ru/artist/1", "track_count": 2},
                    {"name": "Artist B", "url": "https://music.yandex.ru/artist/2", "track_count": 3},
                ],
            }),
        )
        db.add(achievement)
        db.commit()
        db.refresh(achievement)
        achievement_id = achievement.id
    finally:
        db.close()

    listing = auth_client.get("/api/achievements/all/profileuser").json()
    item = next(a for a in listing["achievements"] if a["id"] == achievement_id)
    assert item["description"] == (
        "Прослушать все треки [Artist A](https://music.yandex.ru/artist/1) "
        "и [Artist B](https://music.yandex.ru/artist/2)"
    )
    assert item["track_progress_available"] is True
