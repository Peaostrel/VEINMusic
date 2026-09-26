"""Unit tests for og_parser, compatibility and antifraud services."""
import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.core.safe_http import UnsafeURLError
from app.models import Scrobble, Track, User, UserIntegration, UserProfile
from app.services import antifraud, compatibility, og_parser


# --- og_parser ---------------------------------------------------------------

def _yandex_client(payloads):
    def handler(request):
        for key, payload in payloads.items():
            if key in str(request.url):
                return httpx.Response(200, json=payload)
        return httpx.Response(404)
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.fixture
def safe_urls():
    with patch.object(og_parser, "is_safe_url", return_value=True):
        yield


def test_parse_generic_html_prefers_og_tags():
    html = ('<html><head><title>Fallback</title>'
            '<meta property="og:title" content="Song | Site">'
            '<meta name="og:image" content="https://img/200x200.jpg"></head></html>')
    assert og_parser._parse_generic_html(html) == ("Song", "https://img/400x400.jpg")
    assert og_parser._parse_generic_html("<title>\n Only title </title>") == ("Only title", None)
    assert og_parser._parse_generic_html("<p>nothing</p>") == (None, None)


def test_yandex_parsers():
    assert og_parser._parse_yandex_artist({"artist": {"name": "A", "cover": {"uri": "img/%%"}}}) == \
        ("A", "https://img/400x400")
    assert og_parser._parse_yandex_album({"title": "Alb"}) == ("Alb", None)
    track = {"track": {"title": "T", "artists": [{"name": "A"}], "coverUri": "c/%%"}}
    assert og_parser._parse_yandex_track(track) == ("A — T", "https://c/400x400")
    assert og_parser._parse_yandex_track({"track": {"title": "T"}, "coverUri": "x/%%"}) == \
        ("T", "https://x/400x400")


@pytest.mark.parametrize("url,key,payload,expected", [
    ("https://music.yandex.ru/artist/42?x=1", "artist.jsx?artist=42",
     {"artist": {"name": "Art", "cover": {"uri": "a/%%"}}}, ("Art", "https://a/400x400")),
    ("https://music.yandex.ru/album/7", "album.jsx?album=7",
     {"title": "Alb", "coverUri": "b/%%"}, ("Alb", "https://b/400x400")),
    ("https://music.yandex.ru/album/7/track/9", "track.jsx?track=9",
     {"track": {"title": "T", "artists": [{"name": "A"}], "coverUri": "c/%%"}}, ("A — T", "https://c/400x400")),
])
def test_parse_yandex_meta_routes(url, key, payload, expected):
    async def run():
        async with _yandex_client({key: payload}) as client:
            return await og_parser._parse_yandex_meta(client, url)
    assert asyncio.run(run()) == expected


def test_parse_yandex_meta_errors_and_unknown_paths():
    async def run(url):
        async with _yandex_client({}) as client:  # 404 -> invalid json
            return await og_parser._parse_yandex_meta(client, url)
    assert asyncio.run(run("https://music.yandex.ru/artist/1")) == (None, None)
    assert asyncio.run(run("https://music.yandex.ru/users/me")) == (None, None)


def test_clean_banned_titles():
    assert og_parser._clean_banned_titles(None, "img") == (None, "img")
    assert og_parser._clean_banned_titles("Яндекс Музыка — собираем музыку для вас", "img") == (None, None)
    assert og_parser._clean_banned_titles("Song", "img") == ("Song", "img")


def test_parse_og_meta_rejects_empty_and_unsafe():
    assert asyncio.run(og_parser.parse_og_meta("")) == (None, None)
    with patch.object(og_parser, "is_safe_url", return_value=False):
        assert asyncio.run(og_parser.parse_og_meta("127.0.0.1/admin")) == (None, None)


def test_parse_og_meta_follows_safe_redirect(safe_urls):
    responses = [
        httpx.Response(302, headers={"Location": "/final"}),
        httpx.Response(200, text='<meta property="og:title" content="Final"><meta property="og:image" content="i">'),
    ]
    calls = []

    async def fake_request(method, url, **kwargs):
        calls.append(url)
        return responses[len(calls) - 1]

    with patch.object(og_parser, "pinned_request", side_effect=fake_request):
        assert asyncio.run(og_parser.parse_og_meta("example.com/start")) == ("Final", "i")
    assert calls == ["https://example.com/start", "https://example.com/final"]


def test_parse_og_meta_blocks_unsafe_redirect():
    safe = {"https://example.com/start": True, "http://169.254.169.254/": False}

    async def fake_request(method, url, **kwargs):
        return httpx.Response(302, headers={"Location": "http://169.254.169.254/"})

    with patch.object(og_parser, "is_safe_url", side_effect=lambda u: safe.get(u, True)), \
            patch.object(og_parser, "pinned_request", side_effect=fake_request):
        assert asyncio.run(og_parser.parse_og_meta("https://example.com/start")) == (None, None)


def test_parse_og_meta_handles_request_errors(safe_urls):
    for error in (httpx.ConnectError("down"), UnsafeURLError("pinned to private IP")):
        with patch.object(og_parser, "pinned_request", new=AsyncMock(side_effect=error)):
            assert asyncio.run(og_parser.parse_og_meta("https://example.com")) == (None, None)
    with patch.object(og_parser, "pinned_request", new=AsyncMock(return_value=httpx.Response(500))):
        assert asyncio.run(og_parser.parse_og_meta("https://example.com")) == (None, None)


def test_parse_og_meta_uses_yandex_api_first(safe_urls):
    with patch.object(og_parser, "_parse_yandex_meta", new=AsyncMock(return_value=("Y", "img"))), \
            patch.object(og_parser, "pinned_request", new=AsyncMock()) as fetch:
        assert asyncio.run(og_parser.parse_og_meta("https://music.yandex.ru/album/1")) == ("Y", "img")
        fetch.assert_not_awaited()


# --- compatibility -----------------------------------------------------------

def _user(db, name, fav_artist=None, fav_genre=None):
    user = User(username=name, hashed_password="x")
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id, favorite_artist=fav_artist, favorite_genre=fav_genre))
    db.commit()
    return user


def _listen(db, user, artist, genre=None, times=1, played_at=None, listened_sec=200, xp=1):
    track = db.query(Track).filter_by(title=f"{artist} song", artist=artist).first()
    if not track:
        track = Track(title=f"{artist} song", artist=artist, genre=genre, duration=200)
        db.add(track)
        db.flush()
    for _ in range(times):
        db.add(Scrobble(user_id=user.id, track_id=track.id, source="yandex", is_playing=False,
                        listened_sec=listened_sec, xp_earned=xp,
                        played_at=played_at or datetime.now(UTC) - timedelta(days=3)))
    db.commit()


def test_compatibility_with_self(db):
    result = compatibility.calculate_compatibility(1, 1, db)
    assert result["score"] == 100


def test_compatibility_identical_taste(db):
    a = _user(db, "a", fav_artist="Band", fav_genre="Rock")
    b = _user(db, "b", fav_artist="band ", fav_genre="rock")
    for u in (a, b):
        _listen(db, u, "Band", genre="Rock", times=3)
        _listen(db, u, "Other", genre="Pop", times=1)
    result = compatibility.calculate_compatibility(a.id, b.id, db)
    assert result["score"] == 100  # capped
    assert result["tier"] == "Космическая связь"
    assert result["common_genres"] == ["pop", "rock"]
    assert result["common_artists"][0] == {
        "artist": "Band", "user1_plays": 3, "user2_plays": 3, "total_plays": 6}


def test_compatibility_disjoint_taste(db):
    a = _user(db, "a")
    b = _user(db, "b")
    _listen(db, a, "One", genre="Jazz")
    _listen(db, b, "Two", genre="Metal")
    result = compatibility.calculate_compatibility(a.id, b.id, db)
    assert result["score"] == 0
    assert result["tier"] == "Разные галактики"
    assert result["common_artists"] == []


@pytest.mark.parametrize("score,tier", [
    (90, "Космическая связь"), (70, "Высокая совместимость"),
    (50, "Умеренная совместимость"), (20, "Низкая совместимость"), (5, "Разные галактики"),
])
def test_compatibility_tiers(score, tier):
    assert compatibility._get_tier(score) == tier


def test_compatibility_helpers_edge_cases():
    assert compatibility._calculate_artist_similarity({"a": 0}, {"a": 0}, {"a"}) == 0.0
    assert compatibility._calculate_profile_bonus(None, None) == 0.0


# --- antifraud ---------------------------------------------------------------

def test_antifraud_clean_user(db):
    user = _user(db, "clean")
    _listen(db, user, "Band", times=5)
    assert antifraud.scan_user_antifraud(user, db) == (False, 0, [])
    assert antifraud.get_all_suspicious_users(db) == []


def test_antifraud_hourly_velocity(db):
    user = _user(db, "fast")
    _listen(db, user, "Band", times=71, played_at=datetime.now(UTC) - timedelta(minutes=5))
    suspicious, risk, reasons = antifraud.scan_user_antifraud(user, db)
    assert suspicious
    assert risk == 45
    assert "71" in reasons[0]


def test_antifraud_moderate_velocity_is_not_enough(db):
    user = _user(db, "busy")
    _listen(db, user, "Band", times=55, played_at=datetime.now(UTC) - timedelta(minutes=5))
    assert antifraud.scan_user_antifraud(user, db) == (False, 20, [])


def test_antifraud_micro_tracks_and_listing(db):
    user = _user(db, "micro")
    db.add(UserIntegration(user_id=user.id, bonus_xp=10))
    db.commit()
    _listen(db, user, "Band", times=30, listened_sec=5)
    suspicious, risk, reasons = antifraud.scan_user_antifraud(user, db)
    assert suspicious
    assert risk == 40
    assert "короткими" in reasons[0]

    flagged = _user(db, "flagged")
    flagged.is_flagged_antifraud = True
    db.commit()

    records = antifraud.get_all_suspicious_users(db)
    assert [r["username"] for r in records] == ["micro", "flagged"]
    assert records[0]["total_scrobbles"] == 30
    assert records[0]["total_xp"] == 40
    assert records[1]["antifraud_reason"] == "Флаг администратора"


def test_antifraud_daily_velocity(db):
    user = _user(db, "daily")
    _listen(db, user, "Band", times=701, played_at=datetime.now(UTC) - timedelta(hours=5))
    suspicious, risk, reasons = antifraud.scan_user_antifraud(user, db)
    assert not suspicious  # only the daily rule fires (35 < 40)
    assert risk == 35
    assert "701" in reasons[0]
