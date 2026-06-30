import pytest
from app.models import User, UserProfile, UserIntegration


def test_register_success(client, db):
    # Register new user
    response = client.post("/auth/register", json={
        "username": "TestUser",
        "password": "strongpassword123"  # NOSONAR
    })
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"  # lowercase check

    # Verify DB state
    db_user = db.query(User).filter(User.username == "testuser").first()
    assert db_user is not None
    assert db_user.role == "user"
    assert db_user.profile is not None
    assert db_user.integration is not None
    assert db_user.api_key is not None
    assert len(db_user.api_key) == 64  # SHA-256 length in hex


def test_register_validation_errors(client, db):
    # Short username
    resp = client.post("/auth/register", json={
        "username": "ab",
        "password": "password"  # NOSONAR
    })
    assert resp.status_code == 400
    assert "Никнейм слишком короткий" in resp.text

    # Short password
    resp = client.post("/auth/register", json={
        "username": "abcd",
        "password": "123"  # NOSONAR
    })
    assert resp.status_code == 400
    assert "Пароль должен быть не менее 6 символов" in resp.text

    # Already taken
    # First register one
    client.post("/auth/register", json={
        "username": "taken",
        "password": "password"  # NOSONAR
    })
    # Try duplicate
    resp = client.post("/auth/register", json={
        "username": "TAKEN",
        "password": "password"  # NOSONAR
    })
    assert resp.status_code == 400
    assert "Никнейм занят" in resp.text


def test_login_success_and_logout(client, db):
    # Register first
    client.post("/auth/register", json={
        "username": "loginuser",
        "password": "password123"  # NOSONAR
    })

    # Log in
    resp = client.post("/auth/login", json={
        "username": "loginuser",
        "password": "password123"  # NOSONAR
    })
    assert resp.status_code == 200
    assert resp.json()["username"] == "loginuser"
    assert "api_key" in resp.cookies

    # Log out
    resp = client.post("/auth/logout")
    assert resp.status_code == 200
    assert resp.cookies.get(
        "api_key") is None or resp.cookies.get("api_key") == ""


def test_login_failure(client, db):
    # Try logging in with non-existent user
    resp = client.post("/auth/login", json={
        "username": "nobody",
        "password": "password"  # NOSONAR
    })
    assert resp.status_code == 400
    assert "Неверный логин/пароль" in resp.text

    # Register first
    client.post("/auth/register", json={
        "username": "loginuser",
        "password": "password123"  # NOSONAR
    })

    # Log in with bad password
    resp = client.post("/auth/login", json={
        "username": "loginuser",
        "password": "wrongpassword"  # NOSONAR
    })
    assert resp.status_code == 400
    assert "Неверный логин/пароль" in resp.text
