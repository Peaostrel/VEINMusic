"""Operational endpoints and background polling."""
import asyncio
import secrets
from unittest.mock import AsyncMock, patch

from app.services import cloud_scrobbling

# Generated per run so that no credentials live in the repository
TEST_PASSWORD = secrets.token_urlsafe(16)


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


def _count_queries(fn):
    from sqlalchemy import event

    from app.database import engine
    statements = []

    def before(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", before)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", before)
    return len(statements)


def test_followers_list_has_no_n_plus_one(client):
    def register(name):
        r = client.post("/auth/register", json={"username": name, "password": TEST_PASSWORD})
        assert r.status_code == 200
        return r.json()["api_key"]

    register("popular")
    keys = [register(f"fan{i}") for i in range(6)]
    client.cookies.clear()

    client.post("/api/follow/popular", json={}, headers={"X-API-Key": keys[0]})
    few = _count_queries(lambda: client.get("/api/followers/popular"))
    for k in keys[1:]:
        client.post("/api/follow/popular", json={}, headers={"X-API-Key": k})
    many = _count_queries(lambda: client.get("/api/followers/popular"))

    assert len(client.get("/api/followers/popular").json()) == 6
    assert many == few  # query count doesn't grow with the number of followers


def test_scrobble_db_work_does_not_block_event_loop(db, client):
    import time as _time
    from unittest.mock import patch

    from app.models import User
    from app.services import scrobble_processor

    client.post("/auth/register", json={"username": "loopuser", "password": TEST_PASSWORD})
    user = db.query(User).filter_by(username="loopuser").first()
    real_record = scrobble_processor._record_scrobble
    state = {"ticks": 0, "during_slow_db": 0}

    def slow_record(*args):
        before = state["ticks"]
        _time.sleep(0.3)  # simulates a slow database call
        state["during_slow_db"] = state["ticks"] - before
        return real_record(*args)

    async def ticker():
        for _ in range(50):
            await asyncio.sleep(0.01)
            state["ticks"] += 1

    async def scenario():
        with patch.object(scrobble_processor, "_record_scrobble", slow_record), \
             patch.object(scrobble_processor, "get_track_genre", new=AsyncMock(return_value=None)):
            await asyncio.gather(
                scrobble_processor.process_scrobble(db, user, "T", "A", "", "", "x", 0, True, 200, ""),
                ticker())

    asyncio.run(scenario())
    # If the DB phase ran on the event loop, no tick could happen meanwhile
    assert state["during_slow_db"] >= 10
