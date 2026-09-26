"""Country list and city suggestions for the profile location.

The browser used to call restcountries.com and OpenStreetMap Nominatim
directly, handing every visitor's IP to both. The API now asks them on the
user's behalf and caches the answers (Nominatim's usage policy also asks for
caching, an identifying User-Agent and a low request rate).
"""
from __future__ import annotations

import logging
import os
import re
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from app.core.rate_limit import limiter
from app.services.cache import get_from_cache, set_to_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/geo", tags=["geo"])

RESTCOUNTRIES_URL = "https://restcountries.com/v3.1/all?fields=name,translations,cca2,flag"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
COUNTRIES_TTL = 7 * 24 * 3600
CITIES_TTL = 24 * 3600
MAX_CITIES = 10
_USER_AGENT = f"VEINMusic/1.0 (+{os.getenv('FRONTEND_URL', 'https://music.vein.guru')})"
_NOISE_RE = re.compile(
    r"(сельсовет|городское поселение|муниципальное образование|район|станция|платформа|парк)",
    re.IGNORECASE)


async def _get_json(url: str, params: dict[str, str] | None = None) -> Any:
    async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": _USER_AGENT}) as client:
        res = await client.get(url, params=params)
        res.raise_for_status()
        return res.json()


def _parse_countries(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    countries = []
    for c in raw:
        if not isinstance(c, dict) or not isinstance(c.get("cca2"), str):
            continue
        name = (c.get("translations", {}).get("rus", {}) or {}).get("common") \
            or (c.get("name") or {}).get("common")
        if name:
            countries.append({"name": str(name), "code": c["cca2"], "flag": str(c.get("flag") or "")})
    return sorted(countries, key=lambda c: c["name"])


def _city_name(place: dict[str, Any]) -> str:
    address = place.get("address") or {}
    name = address.get("city") or address.get("town") or address.get("village") or place.get("name") or ""
    return _NOISE_RE.sub("", str(name).split(",")[0]).strip()


def _parse_cities(raw: Any, query: str) -> list[str]:
    if not isinstance(raw, list):
        return []
    q = query.lower()
    places = sorted((p for p in raw if isinstance(p, dict)),
                    key=lambda p: float(p.get("importance") or 0), reverse=True)
    result: list[str] = []
    for place in places:
        name = _city_name(place)
        n = name.lower()
        if len(name) >= 2 and (q in n or n in q) and name not in result:
            result.append(name)
        if len(result) >= MAX_CITIES:
            break
    return result


@router.get("/countries", responses={502: {"description": "Country list unavailable"}})
async def list_countries():
    """Countries with Russian names, ISO code and flag."""
    cached = get_from_cache("geo:countries", ttl=COUNTRIES_TTL)
    if cached is not None:
        return cached
    try:
        countries = _parse_countries(await _get_json(RESTCOUNTRIES_URL))
    except (httpx.HTTPError, ValueError) as e:
        logger.warning(f"[Geo] restcountries failed: {e}")
        countries = []
    if not countries:
        raise HTTPException(502, "Список стран недоступен")
    set_to_cache("geo:countries", countries, expire=COUNTRIES_TTL)
    return countries


@router.get("/cities", responses={502: {"description": "City search unavailable"}})
@limiter.limit("30/minute")
async def search_cities(
    request: Request,
    country: Annotated[str, Query(pattern=r"^[A-Za-z]{2}$")],
    q: Annotated[str, Query(min_length=2, max_length=64)],
):
    """Up to 10 city names in the country matching the query."""
    country = country.lower()
    query = " ".join(q.split())
    key = f"geo:cities:{country}:{query.lower()}"
    cached = get_from_cache(key, ttl=CITIES_TTL)
    if cached is not None:
        return cached
    try:
        raw = await _get_json(NOMINATIM_URL, {
            "q": query, "format": "json", "accept-language": "ru", "addressdetails": "1",
            "countrycodes": country, "limit": "20",
        })
    except (httpx.HTTPError, ValueError) as e:
        logger.warning(f"[Geo] nominatim failed: {e}")
        raise HTTPException(502, "Поиск городов недоступен")
    cities = _parse_cities(raw, query)
    set_to_cache(key, cities, expire=CITIES_TTL)
    return cities
