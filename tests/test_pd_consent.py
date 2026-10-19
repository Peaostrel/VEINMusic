"""The consent to personal data processing ticked at sign-up is recorded."""
import secrets

from app.models import User
from app.routers.auth import PD_CONSENT_VERSION

TEST_PASSWORD = secrets.token_urlsafe(16)


def test_sign_up_records_the_consent_and_its_version(client, db):
    resp = client.post("/auth/register", json={
        "username": "consenting", "password": TEST_PASSWORD, "pd_consent": True})
    assert resp.status_code == 200, resp.text
    user = db.query(User).filter(User.username == "consenting").one()
    assert user.pd_consent_at is not None
    assert user.pd_consent_version == PD_CONSENT_VERSION


def test_sign_up_without_the_tick_records_nothing(client, db):
    resp = client.post("/auth/register", json={"username": "silent", "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    user = db.query(User).filter(User.username == "silent").one()
    assert user.pd_consent_at is None
    assert user.pd_consent_version is None
