"""Country list and city suggestions for the profile location.

The browser used to call restcountries.com and OpenStreetMap Nominatim
directly, handing every visitor's IP to both. Countries are now a bundled
list (ISO 3166-1 codes with Russian names, app/data/countries.json, and
English names by code, app/data/countries_en.json): the
restcountries API it came from was retired, so it can't break again. Cities
are asked from Nominatim on the user's behalf and cached (its usage policy
also asks for caching, an identifying User-Agent and a low request rate).
"""
from __future__ import annotations

import json
import logging
import os
import re
from functools import cache
from pathlib import Path
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.core.i18n import LANG_HEADER, request_lang, tr
from app.core.rate_limit import limiter
from app.services.cache import get_from_cache, set_to_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/geo", tags=["geo"])

COUNTRIES_FILE = Path(__file__).resolve().parent.parent / "data" / "countries.json"
COUNTRIES_EN_FILE = COUNTRIES_FILE.with_name("countries_en.json")
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
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


@cache
def _countries() -> list[dict[str, str]]:
    return json.loads(COUNTRIES_FILE.read_text(encoding="utf-8"))


@cache
def _countries_en() -> list[dict[str, str]]:
    """English names sorted in English; name_ru keeps the Russian name a
    saved location may still use."""
    english = json.loads(COUNTRIES_EN_FILE.read_text(encoding="utf-8"))
    countries = [{**c, "name": english.get(c["code"], c["name"]), "name_ru": c["name"]} for c in _countries()]
    return sorted(countries, key=lambda c: c["name"].casefold())


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


@router.get("/countries")
def list_countries(request: Request, response: Response):
    """Countries with names in the visitor's language, ISO code and flag."""
    response.headers["Cache-Control"] = "public, max-age=86400"
    response.headers["Vary"] = f"Accept-Language, {LANG_HEADER}"
    return _countries_en() if request_lang(request) == "en" else _countries()


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
    lang = request_lang(request)
    key = f"geo:cities:{country}:{query.lower()}" + ("" if lang == "ru" else f":{lang}")
    cached = get_from_cache(key, ttl=CITIES_TTL)
    if cached is not None:
        return cached
    try:
        raw = await _get_json(NOMINATIM_URL, {
            "q": query, "format": "json", "accept-language": lang, "addressdetails": "1",
            "countrycodes": country, "limit": "20",
        })
    except (httpx.HTTPError, ValueError) as e:
        logger.warning(f"[Geo] nominatim failed: {e}")
        raise HTTPException(502, tr(lang, "Поиск городов недоступен"))
    cities = _parse_cities(raw, query)
    set_to_cache(key, cities, expire=CITIES_TTL)
    return cities
