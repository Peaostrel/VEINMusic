"""Operational endpoints and background polling."""
import asyncio
from unittest.mock import AsyncMock, patch

from app.services import cloud_scrobbling


def test_health_reports_database(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["redis"] in ("ok", "unavailable")


def test_poll_once_skips_when_another_process_holds_the_lock():
    fake_redis = AsyncMock()
    fake_redis.set.return_value = False  # lock already taken
    with patch("app.core.redis.get_redis_client", return_value=fake_redis), \
         patch.object(cloud_scrobbling, "get_pollable_user_ids") as get_ids:
        asyncio.run(cloud_scrobbling.poll_once(AsyncMock()))
    get_ids.assert_not_called()


def test_poll_once_polls_and_releases_lock():
    fake_redis = AsyncMock()
    fake_redis.set.return_value = True
    with patch("app.core.redis.get_redis_client", return_value=fake_redis), \
         patch.object(cloud_scrobbling, "get_pollable_user_ids", return_value=[1, 2]), \
         patch.object(cloud_scrobbling, "poll_user", new=AsyncMock()) as poll_user:
        asyncio.run(cloud_scrobbling.poll_once(AsyncMock()))
    assert poll_user.await_count == 2
    fake_redis.delete.assert_awaited_once_with(cloud_scrobbling.POLL_LOCK_KEY)


def test_together_room_is_removed_after_everyone_leaves(client):
    origin = {"Origin": "http://localhost:3000"}
    with client.websocket_connect("/ws/together/cleanup-room", headers=origin) as ws:
        assert ws.receive_json()["type"] == "ROOM_STATE"
        rooms = client.get("/api/together/rooms").json()["rooms"]
        assert any(r["room_id"] == "cleanup-room" for r in rooms)
    rooms = client.get("/api/together/rooms").json()["rooms"]
    assert not any(r["room_id"] == "cleanup-room" for r in rooms)


def test_api_sends_security_headers(client):
    resp = client.get("/api/public-stats")
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in resp.headers["Content-Security-Policy"]
    # Swagger UI needs its CDN scripts
    assert "Content-Security-Policy" not in client.get("/docs").headers


def test_push_disabled_without_vapid_key(client, monkeypatch):
    from app.services import push_notifications
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    push_notifications._vapid_private_key.cache_clear()
    body = client.get("/api/push/vapid-key").json()
    assert body == {"enabled": False, "vapid_public_key": None}


def test_web_push_encryption_matches_rfc8291_vector():
    from cryptography.hazmat.primitives.asymmetric import ec

    from app.services.push_notifications import _b64url_decode, _b64url_encode, encrypt_payload

    server_key = ec.derive_private_key(
        int.from_bytes(_b64url_decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"), "big"), ec.SECP256R1())
    body = encrypt_payload(
        b"When I grow up, I want to be a watermelon",
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        "BTBZMqHH6r4Tts7J_aSIgg",
        salt=_b64url_decode("DGv6ra1nlYgDCS1FRnbzlw"),
        server_key=server_key,
    )
    assert _b64url_encode(body) == (
        "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzA"
        "C8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN")


def test_vapid_authorization_header_is_valid_es256_jwt(monkeypatch):
    import jwt as pyjwt
    from cryptography.hazmat.primitives.asymmetric import ec

    from app.services import push_notifications as push

    keys = push.generate_vapid_keys()
    monkeypatch.setenv("VAPID_PRIVATE_KEY", keys["VAPID_PRIVATE_KEY"])
    monkeypatch.delenv("VAPID_PUBLIC_KEY", raising=False)
    push._vapid_private_key.cache_clear()
    try:
        header = push._vapid_authorization("https://fcm.googleapis.com/fcm/send/abc")
        token = header.split("t=")[1].split(",")[0]
        public = ec.EllipticCurvePublicKey.from_encoded_point(
            ec.SECP256R1(), push._b64url_decode(keys["VAPID_PUBLIC_KEY"]))
        claims = pyjwt.decode(token, public, algorithms=["ES256"], audience="https://fcm.googleapis.com")
        assert claims["sub"].startswith("mailto:")
        assert header.endswith("k=" + keys["VAPID_PUBLIC_KEY"])
    finally:
        push._vapid_private_key.cache_clear()
