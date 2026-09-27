from unittest.mock import patch
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
