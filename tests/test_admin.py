import pytest
from app.models import User
from app.core.security import create_session_token
from app.database import SessionLocal


@pytest.fixture
def test_admin_client(client, db):
    client.post(
        "/auth/register",
        json={
            "username": "testadmin",
            "password": "password"})
    admin = db.query(User).filter(User.username == "testadmin").first()
    admin.role = "admin"
    db.commit()
    token = create_session_token(admin.username, admin.hashed_password)
    client.cookies.set("api_key", token)
    client.headers["Origin"] = "http://localhost:3000"
    return client


@pytest.fixture
def test_normal_user(client, db):
    client.post(
        "/auth/register",
        json={
            "username": "normaluser",
            "password": "password"})
    return db.query(User).filter(User.username == "normaluser").first()


def test_get_admin_stats(test_admin_client):
    resp = test_admin_client.get("/api/admin/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_users" in data
    assert "total_scrobbles" in data
    assert "users" in data


def test_verify_user(test_admin_client, test_normal_user, db):
    # Verify user
    resp = test_admin_client.post(
        f"/api/admin/users/{test_normal_user.username}/verify",
        json={
            "is_verified": True})
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["is_verified"] is True

    # Check DB
    db.close()
    db = SessionLocal()
    user = db.query(User).filter(
        User.username == test_normal_user.username).first()
    assert user.integration.is_verified is True


def test_verify_user_not_found(test_admin_client):
    resp = test_admin_client.post(
        "/api/admin/users/ghost/verify",
        json={
            "is_verified": True})
    assert resp.status_code == 404


def test_delete_user(test_admin_client, test_normal_user, db):
    username = test_normal_user.username
    resp = test_admin_client.delete(f"/api/admin/users/{username}")
    assert resp.status_code == 200

    # Check DB
    db.close()
    db = SessionLocal()
    deleted_user = db.query(User).filter(User.username == username).first()
    assert deleted_user is None


def test_delete_admin_fails(test_admin_client, db):
    admin = db.query(User).filter(User.username == "testadmin").first()
    resp = test_admin_client.delete(f"/api/admin/users/{admin.username}")
    assert resp.status_code == 400
    assert "Нельзя удалить разработчика" in resp.json()["detail"]
