"""Requests that could exhaust memory or CPU are refused cheaply."""

import asyncio

import pytest

from app.core import body_limit

ORIGIN = {"Origin": "http://localhost:3000"}


def test_oversized_json_is_refused_before_parsing(client, monkeypatch):
    parsed = []
    import json as json_module

    real_loads = json_module.loads

    def spy(*args, **kwargs):
        parsed.append(True)
        return real_loads(*args, **kwargs)

    monkeypatch.setattr(json_module, "loads", spy)
    # Nested empty arrays: tiny on the wire, huge once parsed
    body = "[" + ",".join(["[]"] * 200_000) + "]"
    response = client.post(
        "/auth/login", content=body, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413
    assert not parsed


def test_oversized_chunked_body_is_cut_off(client):
    def chunks():
        for _ in range(100):
            yield b"[" + b"[]," * 2000 + b"[]]"

    response = client.post(
        "/auth/login", content=chunks(), headers={"Content-Type": "application/json"}
    )
    assert response.status_code in (400, 413)


def test_small_requests_still_work(client):
    response = client.post(
        "/auth/register",
        json={"username": "limits_ok", "password": "limits-test-password"},
    )
    assert response.status_code == 200, response.text


def test_bigger_limits_only_where_needed():
    assert body_limit.limit_for("/auth/login") == body_limit.DEFAULT_LIMIT
    assert body_limit.limit_for("/api/upload") > 5 * 1024 * 1024
    assert body_limit.limit_for("/api/account/history/import") > body_limit.DEFAULT_LIMIT


def test_large_bodies_are_processed_a_few_at_a_time(monkeypatch):
    sent = []

    async def app(scope, receive, send):
        await asyncio.sleep(0.05)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = body_limit.BodySizeLimitMiddleware(app)
    monkeypatch.setattr(body_limit, "_large_slots", asyncio.Semaphore(1))

    async def call():
        statuses = []

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])

        scope = {
            "type": "http", "method": "POST", "path": "/api/account/history/import",
            "headers": [(b"content-length", str(1024 * 1024).encode())],
        }
        await middleware(scope, receive, send)
        sent.extend(statuses)

    async def run():
        await asyncio.gather(call(), call())

    asyncio.run(run())
    assert sorted(sent) == [200, 503]


@pytest.mark.parametrize("path", ["/api/upload", "/api/account/history/preview"])
def test_declared_size_over_the_path_limit_is_refused(client, path):
    size = body_limit.limit_for(path) + 1
    response = client.post(path, content=b"x" * size, headers={**ORIGIN, "Content-Type": "application/json"})
    assert response.status_code == 413


def _register_with_key(client, username):
    response = client.post(
        "/auth/register",
        json={"username": username, "password": "key-guard-password"},
    )
    assert response.status_code == 200, response.text
    client.cookies.clear()
    return response.json()["api_key"]


def _count_pbkdf2(monkeypatch):
    import hashlib

    calls = []
    real = hashlib.pbkdf2_hmac

    def counting(*args, **kwargs):
        calls.append(True)
        return real(*args, **kwargs)

    monkeypatch.setattr(hashlib, "pbkdf2_hmac", counting)
    return calls


def test_known_key_skips_the_slow_hash(client, monkeypatch):
    key = _register_with_key(client, "keyguard_known")
    assert client.get("/api/profile/preferences", headers={"X-API-Key": key}).status_code == 200
    calls = _count_pbkdf2(monkeypatch)
    for _ in range(5):
        assert client.get("/api/profile/preferences", headers={"X-API-Key": key}).status_code == 200
    assert calls == []


def test_wrong_keys_are_refused_before_hashing(client, monkeypatch):
    from app.core import key_guard

    calls = _count_pbkdf2(monkeypatch)
    statuses = [
        client.get("/api/profile/preferences", headers={"X-API-Key": f"wrong{i:027d}"}).status_code
        for i in range(key_guard.MAX_FAILURES + 5)
    ]
    assert statuses[: key_guard.MAX_FAILURES] == [401] * key_guard.MAX_FAILURES
    assert set(statuses[key_guard.MAX_FAILURES:]) == {429}
    assert len(calls) == key_guard.MAX_FAILURES


def test_regenerated_key_stops_working_at_once(client):
    key = _register_with_key(client, "keyguard_regen")
    assert client.get("/api/profile/preferences", headers={"X-API-Key": key}).status_code == 200
    login = client.post(
        "/auth/login", json={"username": "keyguard_regen", "password": "key-guard-password"}
    )
    assert login.status_code == 200
    regenerated = client.post("/api/profile/apikey/generate", headers=ORIGIN)
    assert regenerated.status_code == 200, regenerated.text
    client.cookies.clear()
    assert client.get("/api/profile/preferences", headers={"X-API-Key": key}).status_code == 401
    new_key = regenerated.json()["api_key"]
    assert client.get("/api/profile/preferences", headers={"X-API-Key": new_key}).status_code == 200


def test_absurdly_long_keys_are_not_hashed(client, monkeypatch):
    calls = _count_pbkdf2(monkeypatch)
    response = client.get("/api/profile/preferences", headers={"X-API-Key": "x" * 5000})
    assert response.status_code == 401
    assert calls == []


def test_visibility_lists_are_cached_and_dropped_on_change(client, db, monkeypatch):
    import json

    from app.models import User, UserIntegration, UserProfile
    from app.services import privacy

    privacy.invalidate_visibility()
    user = User(username="visibility_cached", hashed_password="x")
    user.profile = UserProfile()
    user.integration = UserIntegration()
    db.add(user)
    db.commit()
    assert "visibility_cached" in privacy.public_statistics_users(db)

    scans = []
    real = privacy._public_rows
    monkeypatch.setattr(privacy, "_public_rows", lambda session: scans.append(1) or real(session))
    privacy.public_statistics_users(db)
    privacy.public_feed_user_ids(db)
    privacy.public_feed_user_ids(db)
    assert len(scans) <= 1  # served from the cache

    # Any committed change drops the lists, whichever code made it
    user.profile.preferences = json.dumps({"privacy": {"statistics": "private"}})
    db.commit()
    assert "visibility_cached" not in privacy.public_statistics_users(db)
    user.profile.preferences = "{}"
    db.commit()
    assert "visibility_cached" in privacy.public_statistics_users(db)
    user.is_banned = True
    db.commit()
    assert "visibility_cached" not in privacy.public_statistics_users(db)


def test_broken_preferences_keep_sections_hidden():
    from types import SimpleNamespace

    from app.services.privacy import is_public_section, light_preferences

    broken = SimpleNamespace(is_private=False, preferences="{not json")
    assert light_preferences(broken)["privacy"]["statistics"] == "all"
    odd = SimpleNamespace(is_private=False, preferences='{"privacy": {"statistics": "everyone!"}}')
    assert not is_public_section(odd, "statistics")


def _flood_call(ip):
    from app.core import flood_guard

    statuses = []

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            statuses.append(message["status"])

    scope = {"type": "http", "method": "GET", "path": "/api/leaderboard",
             "headers": [], "client": (ip, 1234)}
    asyncio.run(flood_guard.FloodGuardMiddleware(app)(scope, receive, send))
    return statuses[0]


def test_flood_guard_stops_one_address(monkeypatch):
    from app.core import flood_guard

    flood_guard.reset()
    monkeypatch.setattr(flood_guard, "REQUESTS_PER_MINUTE", 5)
    monkeypatch.setattr(flood_guard, "_redis", lambda: None)
    statuses = [_flood_call("8.8.8.8") for _ in range(8)]
    assert statuses == [200] * 5 + [429] * 3
    # Other clients are not affected
    assert _flood_call("8.8.4.4") == 200
    flood_guard.reset()


def test_flood_guard_skips_the_sites_own_servers(monkeypatch):
    from app.core import flood_guard

    flood_guard.reset()
    monkeypatch.setattr(flood_guard, "REQUESTS_PER_MINUTE", 1)
    monkeypatch.setattr(flood_guard, "_redis", lambda: None)
    for ip in ("172.30.0.20", "127.0.0.1", "10.0.0.5"):
        assert [_flood_call(ip) for _ in range(3)] == [200] * 3


HEAVY_ENDPOINTS = [
    "app.routers.library.unified_search",
    "app.routers.library.artist_details",
    "app.routers.library.track_details",
    "app.routers.stats.get_stats",
    "app.routers.stats.get_detailed_stats",
    "app.routers.stats.get_wrapped_stats",
    "app.routers.stats.get_activity",
    "app.routers.stats.get_listening_calendar",
    "app.routers.leaderboard.get_leaderboard",
    "app.routers.leaderboard.get_public_stats",
    "app.routers.leaderboard.get_public_week",
    "app.routers.experience.calendar_range",
    "app.routers.discovery.get_taste_match",
    "app.routers.discovery.get_user_taste_compatibility",
    "app.routers.discovery.get_user_recommendations",
    "app.routers.discovery.smart_redirect",
    "app.routers.discovery.get_search_suggestions",
    "app.routers.users.search_users",
    "app.routers.users.get_user_mood",
    "app.routers.scrobbling.api_get_taste_twins",
    "app.routers.achievements.get_all_achievements",
]


def test_expensive_public_endpoints_have_their_own_limits(client):
    from app.core.rate_limit import limiter

    missing = [name for name in HEAVY_ENDPOINTS if not limiter._route_limits.get(name)]
    assert missing == []


def test_suggestions_are_limited_and_cached(client, monkeypatch):
    from app.core.rate_limit import OUTBOUND_LIMIT, limiter
    from app.services import cache, metadata_search

    calls = []

    async def fake(query, entity_type):
        calls.append(query)
        return [{"title": query.title(), "image": ""}]

    monkeypatch.setattr(metadata_search, "search_suggestions", fake)
    cache.CACHE.clear()
    for _ in range(3):
        response = client.get("/api/search-suggestions", params={"q": "Molchat", "type": "artist"})
        assert response.status_code == 200
        assert response.json()["results"] == [{"title": "Molchat", "image": ""}]
    assert calls == ["Molchat"]

    too_long = client.get("/api/search-suggestions", params={"q": "x" * 500, "type": "artist"})
    assert too_long.status_code == 422

    allowed = int(OUTBOUND_LIMIT.split("/")[0])
    # Counters live in memory here (the tests have no Redis)
    monkeypatch.setattr(limiter, "_storage_dead", True)
    limiter._fallback_storage.reset()
    monkeypatch.setattr(limiter, "enabled", True)
    statuses = [
        client.get("/api/search-suggestions", params={"q": f"q{i}", "type": "artist"}).status_code
        for i in range(allowed + 2)
    ]
    limiter._fallback_storage.reset()
    assert statuses[:allowed] == [200] * allowed
    assert statuses[allowed:] == [429, 429]


def test_people_search_hides_private_and_banned_profiles(client, db):
    from app.models import User, UserIntegration, UserProfile

    for name, private, banned in (("findme_open", False, False),
                                  ("findme_private", True, False),
                                  ("findme_banned", False, True)):
        user = User(username=name, hashed_password="x", is_banned=banned)
        user.profile = UserProfile(is_private=private)
        user.integration = UserIntegration()
        db.add(user)
    db.commit()
    response = client.get("/api/search/users", params={"q": "findme"})
    assert response.status_code == 200
    assert [card["username"] for card in response.json()] == ["findme_open"]


def test_public_counters_are_cached(client, db, monkeypatch):
    from app.models import User
    from app.services import cache

    cache.CACHE.clear()
    first = client.get("/api/public-stats").json()
    queries = []
    real_query = db.query
    monkeypatch.setattr(type(db), "query", lambda self, *a, **k: queries.append(a) or real_query(*a, **k))
    assert client.get("/api/public-stats").json() == first
    assert not [q for q in queries if q and q[0] is User]


def test_refusals_carry_cors_headers(client, monkeypatch):
    from app.core import flood_guard

    monkeypatch.setattr(flood_guard, "REQUESTS_PER_MINUTE", 0)
    monkeypatch.setattr(flood_guard, "_redis", lambda: None)
    response = client.get("/api/leaderboard", headers=ORIGIN)
    flood_guard.reset()
    assert response.status_code == 429
    # The site can read the refusal and say "try again later"
    assert response.headers["access-control-allow-origin"] == ORIGIN["Origin"]


def test_deleted_account_leaves_the_visibility_lists(client, db):
    from app.models import User, UserIntegration, UserProfile
    from app.services import privacy

    user = User(username="visibility_deleted", hashed_password="x")
    user.profile = UserProfile()
    user.integration = UserIntegration()
    db.add(user)
    db.commit()
    assert "visibility_deleted" in privacy.public_statistics_users(db)
    db.delete(user)
    db.commit()
    assert "visibility_deleted" not in privacy.public_statistics_users(db)


def test_flood_guard_counts_locally_when_redis_fails(monkeypatch):
    from app.core import flood_guard

    class Broken:
        def pipeline(self, transaction=False):
            raise ConnectionError("redis is down")

    flood_guard.reset()
    monkeypatch.setattr(flood_guard, "REQUESTS_PER_MINUTE", 2)
    monkeypatch.setattr(flood_guard, "_redis", lambda: Broken())
    assert [_flood_call("1.1.1.1") for _ in range(3)] == [200, 200, 429]
    flood_guard.reset()


def test_keys_in_use_stay_known(monkeypatch):
    from app.core import key_guard

    key_guard.reset()
    key_guard.remember("vm_in_use", 1, "stored")
    now = key_guard.time.time()
    monkeypatch.setattr(key_guard.time, "time", lambda: now + key_guard.CACHE_TTL_SEC - 1)
    assert key_guard.cached("vm_in_use") == (1, "stored")
    monkeypatch.setattr(key_guard.time, "time", lambda: now + 2 * key_guard.CACHE_TTL_SEC - 5)
    # Used a moment before expiring, so still known now
    assert key_guard.cached("vm_in_use") == (1, "stored")
    key_guard.reset()


def test_profile_links_with_long_favourites_still_redirect(client):
    response = client.get("/api/redirect", params={"source": "other", "type": "album", "q": "a" * 513},
                          follow_redirects=False)
    assert response.status_code in (302, 307)
