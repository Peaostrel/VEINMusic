"""Findings of the security review: long passwords, owner-only profile
fields, the public API description and SSRF address checks."""
import bcrypt

from app.core.security import create_session_token, get_password_hash, verify_password
from app.models import User, UserIntegration, UserProfile
from app.utils import _is_public_ip

LONG = "я" * 50  # 100 bytes in UTF-8, within the 128-character limit


def test_long_password_signs_up_and_in(client):
    assert client.post("/auth/register", json={"username": "long_pw", "password": LONG}).status_code == 200
    client.cookies.clear()
    assert client.post("/auth/login", json={"username": "long_pw", "password": LONG}).status_code == 200
    client.cookies.clear()
    wrong = client.post("/auth/login", json={"username": "long_pw", "password": "ю" + "я" * 49})
    assert wrong.status_code == 400


def test_hashes_made_by_older_bcrypt_still_verify():
    # bcrypt < 5 silently used the first 72 bytes of a longer password
    legacy = bcrypt.hashpw(LONG.encode()[:72], bcrypt.gensalt()).decode()
    assert verify_password(LONG, legacy)
    assert verify_password(LONG, get_password_hash(LONG))
    assert not verify_password("другой пароль", get_password_hash(LONG))


def test_account_settings_are_not_shown_to_other_visitors(client, db):
    user = User(username="private_bits", hashed_password="x",
                profile=UserProfile(hidden_artists="Guilty Pleasure"),
                integration=UserIntegration(lastfm_username="secret_fm", yandex_token="t",
                                            spotify_refresh_token="r"))
    db.add(user)
    db.commit()
    public = client.get("/api/user/private_bits").json()
    assert public["hidden_artists"] == ""
    assert public["lastfm_username"] is None
    assert public["last_sync"] is None
    assert not public["spotify_linked"]
    assert not public["yandex_linked"]

    token = create_session_token(str(user.id), str(user.hashed_password), int(user.session_version))
    own = client.get("/api/user/private_bits", headers={"X-API-Key": token}).json()
    assert own["hidden_artists"] == "Guilty Pleasure"
    assert own["lastfm_username"] == "secret_fm"
    assert own["spotify_linked"]
    assert own["yandex_linked"]


def test_public_api_description_omits_admin_endpoints_in_production(client, monkeypatch):
    assert any(p.startswith("/api/admin") for p in client.get("/openapi.json").json()["paths"])
    monkeypatch.setenv("ENVIRONMENT", "production")
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/scrobble" in paths
    assert not any(p.startswith("/api/admin") for p in paths)
    monkeypatch.delenv("ENVIRONMENT")
    assert any(p.startswith("/api/admin") for p in client.get("/openapi.json").json()["paths"])


def test_nat64_addresses_are_judged_by_the_embedded_ipv4():
    assert not _is_public_ip("64:ff9b::7f00:1")  # 127.0.0.1
    assert not _is_public_ip("64:ff9b::a9fe:a9fe")  # 169.254.169.254 (cloud metadata)
    assert _is_public_ip("64:ff9b::808:808")  # 8.8.8.8
