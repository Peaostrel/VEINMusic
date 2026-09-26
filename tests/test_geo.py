"""Country list and city suggestions proxied through the API."""
from unittest.mock import AsyncMock, patch

import httpx

from app.routers import geo

RESTCOUNTRIES = [
    {"name": {"common": "Germany"}, "translations": {"rus": {"common": "Германия"}}, "cca2": "DE", "flag": "🇩🇪"},
    {"name": {"common": "Austria"}, "cca2": "AT", "flag": "🇦🇹"},
    {"name": {"common": "Broken"}},  # no code: skipped
    "junk",
]

NOMINATIM = [
    {"name": "Москва", "importance": 0.5, "address": {"city": "Москва"}},
    {"name": "Московский район", "importance": 0.9, "address": {"town": "Московский"}},
    {"name": "Москва, станция", "importance": 0.1, "address": {}},
    {"name": "Тверь", "importance": 0.8, "address": {"city": "Тверь"}},
]


def test_countries_are_parsed_sorted_and_cached(client):
    fetch = AsyncMock(return_value=RESTCOUNTRIES)
    with patch.object(geo, "_get_json", fetch):
        first = client.get("/api/geo/countries").json()
        second = client.get("/api/geo/countries").json()
    assert first == second == [
        {"name": "Austria", "code": "AT", "flag": "🇦🇹"},
        {"name": "Германия", "code": "DE", "flag": "🇩🇪"},
    ]
    fetch.assert_awaited_once()


def test_countries_unavailable(client):
    with patch.object(geo, "_get_json", AsyncMock(side_effect=httpx.ConnectError("down"))):
        assert client.get("/api/geo/countries").status_code == 502
    with patch.object(geo, "_get_json", AsyncMock(return_value={"message": "Not Found"})):
        assert client.get("/api/geo/countries").status_code == 502


def test_cities_are_filtered_ranked_and_cached(client):
    fetch = AsyncMock(return_value=NOMINATIM)
    with patch.object(geo, "_get_json", fetch):
        cities = client.get("/api/geo/cities", params={"country": "RU", "q": "моск"}).json()
        again = client.get("/api/geo/cities", params={"country": "ru", "q": "  Моск "}).json()
    # Noise words stripped, ranked by importance, deduplicated, query matched
    assert cities == again == ["Московский", "Москва"]
    fetch.assert_awaited_once()
    params = fetch.await_args.args[1]
    assert params["countrycodes"] == "ru"
    assert params["q"] == "моск"


def test_cities_validate_input(client):
    assert client.get("/api/geo/cities", params={"country": "RUS", "q": "ab"}).status_code == 422
    assert client.get("/api/geo/cities", params={"country": "RU", "q": "a"}).status_code == 422
    assert client.get("/api/geo/cities", params={"country": "RU", "q": "x" * 65}).status_code == 422


def test_cities_unavailable(client):
    with patch.object(geo, "_get_json", AsyncMock(side_effect=httpx.ConnectError("down"))):
        assert client.get("/api/geo/cities", params={"country": "DE", "q": "Berlin"}).status_code == 502


def test_get_json_sends_user_agent():
    import asyncio
    seen = {}

    def handler(request):
        seen["ua"] = request.headers["User-Agent"]
        return httpx.Response(200, json=[1])

    real = httpx.AsyncClient
    with patch.object(geo.httpx, "AsyncClient",
                      side_effect=lambda **kw: real(transport=httpx.MockTransport(handler), **kw)):
        assert asyncio.run(geo._get_json("https://example.org/x")) == [1]
    assert seen["ua"].startswith("VEINMusic/")


def test_parsers_ignore_bad_payloads():
    assert geo._parse_countries({"x": 1}) == []
    assert geo._parse_cities("nope", "q") == []
