from app.core.partitioning import generate_partition_ddl
from app.models import User, UserProfile
from app.services.external_sync import _generate_lastfm_signature
from app.services.og_image import generate_achievement_card_svg, generate_recap_card_svg
from app.services.recommendations import generate_smart_recommendations
from app.services.webhooks import sign_payload
from desktop_client.scrobbler import DesktopScrobbler


def test_desktop_scrobbler_offline_buffering(tmp_path, monkeypatch):
    """Test desktop client offline buffering and queue persistence."""
    monkeypatch.setattr("desktop_client.scrobbler.CONFIG_DIR", tmp_path)
    monkeypatch.setattr("desktop_client.scrobbler.QUEUE_FILE", tmp_path / "queue.json")

    scrobbler = DesktopScrobbler("http://127.0.0.1:8000", "")
    assert scrobbler.api_key == ""
    # Should buffer locally when no API key
    scrobbler.scrobble("After Hours", "The Weeknd", duration=240)
    assert len(scrobbler.queue) == 1
    assert scrobbler.queue[0]["title"] == "After Hours"
    assert scrobbler.queue[0]["artist"] == "The Weeknd"


def test_lastfm_signature_generation():
    """Test Last.fm AudioScrobbler 2.0 MD5 signature generator."""
    params = {
        "method": "track.scrobble",
        "artist": "Radiohead",
        "track": "Creep",
        "api_key": "test_api_key",
    }
    sig = _generate_lastfm_signature(params, "test_secret")
    assert isinstance(sig, str)
    assert len(sig) == 32


def test_webhook_hmac_signing():
    """Test HMAC-SHA256 signature calculation for webhooks."""
    secret = "secret_key_123"
    payload = b'{"event": "scrobble.created"}'
    sig = sign_payload(secret, payload)
    assert isinstance(sig, str)
    assert len(sig) == 64


def test_og_recap_svg_generation():
    """Test 1200x630 social recap card SVG."""
    svg = generate_recap_card_svg(
        username="soundmaster",
        period_title="ИТОГИ НЕДЕЛИ",
        total_scrobbles=142,
        total_hours=8.5,
        top_artists=[("Daft Punk", 45), ("Justice", 30)],
        top_genre="French House",
    )
    assert "<svg" in svg
    assert "soundmaster" in svg
    assert "142" in svg
    assert "Daft Punk" in svg
    assert "French House" in svg


def test_og_achievement_svg_generation():
    """Test 1200x630 achievement social card SVG."""
    svg = generate_achievement_card_svg(
        username="audiophile",
        title="Ночной слушатель",
        description="Слушайте музыку после полуночи",
        icon="🌙",
        reward_xp=50,
    )
    assert "<svg" in svg
    assert "audiophile" in svg
    assert "Ночной слушатель" in svg
    assert "+50 XP" in svg


def test_partitioning_ddl_generator():
    """Test PostgreSQL monthly range partitioning helper."""
    tbl, start, end = generate_partition_ddl(2026, 8)
    assert tbl == "scrobbles_2026_08"
    assert start == "2026-08-01"
    assert end == "2026-09-01"


def test_smart_recommendations_service(db):
    """Test recommendations engine with taste profile."""
    user = User(username="taste_tester", role="user")
    user.profile = UserProfile(favorite_genre="Synthwave")
    db.add(user)
    db.commit()

    recs = generate_smart_recommendations(user, db, limit=5)
    assert recs["user"] == "taste_tester"
    assert "recommendations" in recs
    assert "recommended_artists" in recs


def test_developer_api_keys_and_webhooks(client, db):
    """Test Developer API key generation, listing, and Webhooks CRUD."""
    client.headers["Origin"] = "http://localhost:3000"
    reg_res = client.post("/auth/register", json={"username": "dev_user", "password": "password123"})
    assert reg_res.status_code == 200

    # 1. Create API key
    key_res = client.post("/api/developer/keys", json={"name": "Test Key", "scopes": "scrobble:write"})
    assert key_res.status_code == 200
    key_data = key_res.json()
    assert "api_key" in key_data
    assert key_data["api_key"].startswith("vm_")
    key_id = key_data["id"]

    # 2. List API keys
    list_res = client.get("/api/developer/keys")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 3. Create Webhook
    wh_res = client.post("/api/developer/webhooks", json={"url": "https://example.com/webhook", "events": "scrobble.created"})
    assert wh_res.status_code == 200
    wh_data = wh_res.json()
    assert "secret" in wh_data
    wh_id = wh_data["id"]

    # 4. List Webhooks
    wh_list = client.get("/api/developer/webhooks")
    assert wh_list.status_code == 200
    assert len(wh_list.json()) >= 1

    # 5. Delete Webhook
    del_wh = client.delete(f"/api/developer/webhooks/{wh_id}")
    assert del_wh.status_code == 200

    # 6. Revoke API Key
    del_key = client.delete(f"/api/developer/keys/{key_id}")
    assert del_key.status_code == 200


def test_listen_together_rooms_endpoint(client):
    """Test Listen Together active rooms endpoint."""
    resp = client.get("/api/together/rooms")
    assert resp.status_code == 200
    data = resp.json()
    assert "rooms" in data


def test_push_notifications_endpoints(client, db):
    """Test Web Push VAPID key and subscription endpoints."""
    # VAPID Key
    v_res = client.get("/api/push/vapid-key")
    assert v_res.status_code == 200
    assert "vapid_public_key" in v_res.json()

    # Register push user
    client.headers["Origin"] = "http://localhost:3000"
    reg_res = client.post("/auth/register", json={"username": "push_user", "password": "password123"})
    assert reg_res.status_code == 200

    sub_res = client.post(
        "/api/push/subscribe",
        json={
            "endpoint": "https://fcm.googleapis.com/fcm/send/test_endpoint_123",
            "p256dh": "key_p256dh",
            "auth": "key_auth",
        },
    )
    assert sub_res.status_code == 200
    assert sub_res.json()["status"] == "ok"
