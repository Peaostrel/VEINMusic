import pytest
from unittest.mock import patch
from app.models import User, UserProfile
from app.core.security import get_current_user, create_session_token
from app.main import app
from app.database import SessionLocal

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
        "favorite_artist_rating": 5,
        "favorite_artist_review": "Awesome punk rock band",
        "favorite_track": "Кукла колдуна",
        "favorite_track_rating": 4,
        "favorite_track_review": "Amazing track",
        "favorite_album": "Акустический альбом",
        "favorite_album_rating": 5,
        "favorite_album_review": "Masterpiece",
        "is_private": True,
        "hidden_artists": "Pop Artist"
    }
    
    with patch("app.routers.profile.search_metadata", return_value=("Mock Name", "Mock Cover", "Mock URL")):
        resp = auth_client.post("/api/profile/update", json=payload, headers={"Origin": "http://localhost:3000"})
        assert resp.status_code == 200
        
    db.close()
    db = SessionLocal()
    updated_user = db.query(User).filter(User.username == auth_user.username).first()
    assert updated_user.profile.theme == "glassmorphism"
    assert updated_user.profile.display_name == "My Nice Name"
    assert updated_user.profile.bio == "Music enthusiast"
    assert updated_user.profile.favorite_artist == "Mock Name"
    assert updated_user.profile.favorite_artist_rating == 5
    assert updated_user.profile.favorite_artist_review == "Awesome punk rock band"
    assert updated_user.profile.is_private is True
    assert updated_user.profile.hidden_artists == "Pop Artist"

def test_update_profile_validation_urls(auth_client):
    # Bad avatar URL
    payload = {"avatar_url": "ftp://bad-url.com"}
    resp = auth_client.post("/api/profile/update", json=payload)
    assert resp.status_code == 400
    assert "Invalid URL" in resp.text

    # Bad cover URL
    payload = {"cover_url": "javascript:alert(1)"}
    resp = auth_client.post("/api/profile/update", json=payload)
    assert resp.status_code == 400
    assert "Invalid URL" in resp.text

def test_update_privacy(auth_client, db, auth_user):
    resp = auth_client.post("/api/profile/privacy", json={"is_private": True, "hidden_artists": "artist1, artist2"})
    assert resp.status_code == 200
    db.close()
    db = SessionLocal()
    updated_user = db.query(User).filter(User.username == auth_user.username).first()
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
    updated_user = db.query(User).filter(User.username == auth_user.username).first()
    import hashlib
    expected_hash = hashlib.sha256(raw_key.encode('utf-8')).hexdigest()
    assert updated_user.api_key == expected_hash

def test_csrf_check(client, db):
    client.cookies.clear()
    client.post("/auth/register", json={
        "username": "csrfuser",
        "password": "password123"
    })
    user = db.query(User).filter(User.username == "csrfuser").first()
    token = create_session_token(user.username, user.hashed_password)
    client.cookies.set("api_key", token)
    
    # Mutating POST without Origin/Referer should return 403
    resp = client.post("/api/profile/privacy", json={"is_private": True})
    assert resp.status_code == 403
    assert "CSRF verification failed" in resp.text

    # Mutating POST with invalid Origin should return 403
    resp = client.post("/api/profile/privacy", json={"is_private": True}, headers={"Origin": "https://attacker.com"})
    assert resp.status_code == 403
    assert "CSRF verification failed" in resp.text

    # Mutating POST with allowed Origin should return 200
    resp = client.post("/api/profile/privacy", json={"is_private": True}, headers={"Origin": "http://localhost:3000"})
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

    # Clear cookies to ensure anonymous request doesn't send registered user's cookie
    client.cookies.clear()
    # Anonymous Access -> 401
    resp = client.get("/api/admin/stats")
    assert resp.status_code == 401

    # Regular User Access -> 403
    regular_token = create_session_token(regular.username, regular.hashed_password)
    client.cookies.set("api_key", regular_token)
    resp = client.get("/api/admin/stats")
    assert resp.status_code == 403

    # Admin User Access -> 200
    client.cookies.clear()
    admin_token = create_session_token(admin_user.username, admin_user.hashed_password)
    client.cookies.set("api_key", admin_token)
    resp = client.get("/api/admin/stats")
    assert resp.status_code == 200
