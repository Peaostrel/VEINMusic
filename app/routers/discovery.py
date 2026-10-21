"""Taste matching, recommendations, search and smart redirects."""

import logging
import urllib.parse
from typing import Annotated

import httpx
from fastapi import (
    APIRouter,
    Depends,
    Query,
    Request,
)
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.constants import USER_AGENT_MOZILLA, YANDEX_MUSIC_DOMAIN
from app.core.i18n import request_lang
from app.core.rate_limit import HEAVY_READ_LIMIT, OUTBOUND_LIMIT, limiter
from app.core.security import get_current_user
from app.database import get_db
from app.models import User
from app.routers.common import _can_view_section, _get_visible_user
from app.services.cache import get_from_cache, set_to_cache
from app.services.privacy import public_statistics_users
from app.services.taste import get_taste_match_internal

logger = logging.getLogger(__name__)

router = APIRouter(tags=["discovery"])

# --- /api/taste-match/{viewer}/{profile} ---


@router.get("/api/taste-match/{viewer}/{profile}")
@limiter.limit(HEAVY_READ_LIMIT)
def get_taste_match(viewer: str, profile: str, request: Request,
                    db: Annotated[Session, Depends(get_db)]):
    viewer_user = db.query(User).filter(User.username == viewer).first()
    profile_user = db.query(User).filter(User.username == profile).first()
    if not viewer_user or not profile_user or viewer == profile:
        return {"match": 0, "common_artists": []}
    # Never reveal listening data of a private profile to other users
    if (not _can_view_section(viewer_user, request, db, "statistics")
            or not _can_view_section(profile_user, request, db, "statistics")):
        return {"match": 0, "common_artists": []}

    # SQL-based artist intersection for performance
    sql = text("""
        SELECT DISTINCT t.artist
        FROM scrobbles s
        JOIN tracks t ON s.track_id = t.id
        WHERE s.excluded_from_stats = false AND s.deleted_at IS NULL AND s.user_id = :u1 AND s.listened_sec * 100 >= t.duration * 85
        INTERSECT
        SELECT DISTINCT t.artist
        FROM scrobbles s
        JOIN tracks t ON s.track_id = t.id
        WHERE s.excluded_from_stats = false AND s.deleted_at IS NULL AND s.user_id = :u2 AND s.listened_sec * 100 >= t.duration * 85
    """)

    common_rows = db.execute(
        sql, {"u1": viewer_user.id, "u2": profile_user.id}).fetchall()
    common_artists = []
    for row in common_rows:
        for a in row[0].split(','):
            common_artists.append(a.strip())

    common_artists = list(set(common_artists))  # Unique clean names

    # Count total unique artists for denominator
    sql_total = text("""
        SELECT COUNT(DISTINCT t.artist)
        FROM scrobbles s
        JOIN tracks t ON s.track_id = t.id
        WHERE s.excluded_from_stats = false AND s.deleted_at IS NULL AND (s.user_id = :u1 OR s.user_id = :u2) AND s.listened_sec * 100 >= t.duration * 85
    """)
    total_unique = db.execute(
        sql_total, {
            "u1": viewer_user.id, "u2": profile_user.id}).scalar() or 1

    match_percent = int((len(common_artists) / total_unique) * 100)
    return {"match": min(match_percent, 100),
            "common_artists": common_artists[:5]}


# --- /api/search/taste ---
@router.get("/api/search/taste", responses={403: {"description": "Statistics hidden"}, 404: {"description": "User not found"}})
@limiter.limit("10/minute")
def search_by_taste(my_username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    _get_visible_user(my_username, request, db, "statistics")
    # Find people with highest taste match (private profiles are excluded)
    visible_names = public_statistics_users(db)
    all_users = db.query(User).filter(
        User.username != my_username, User.id.in_(list(visible_names.values()))).limit(50).all()
    results = []
    for u in all_users:
        if u.username not in visible_names:
            continue
        match_data = get_taste_match_internal(my_username, u.username, db)
        if match_data and match_data['match'] > 50:
            results.append({
                "username": u.username,
                "display_name": u.profile.display_name or u.username,
                "avatar_url": u.profile.avatar_url,
                "match": match_data['match']
            })
    results.sort(key=lambda x: x['match'], reverse=True)
    return results[:10]


# --- /api/redirect ---
def _yandex_redirect_for_type(type: str, res: dict):
    """Try to build a direct Yandex Music redirect from search results."""
    if type == "artist":
        items = res.get("artists", {}).get("results", [])
        if items:
            return RedirectResponse(
                url=f"https://{YANDEX_MUSIC_DOMAIN}/artist/{items[0]['id']}")
    elif type == "album":
        items = res.get("albums", {}).get("results", [])
        if items:
            return RedirectResponse(
                url=f"https://{YANDEX_MUSIC_DOMAIN}/album/{items[0]['id']}")
    elif type == "track":
        items = res.get("tracks", {}).get("results", [])
        if items:
            alb_list = items[0].get("albums", [])
            alb_id = alb_list[0].get("id") if alb_list else None
            if alb_id:
                safe_alb = urllib.parse.quote(str(alb_id))
                safe_track = urllib.parse.quote(str(items[0]['id']))
                url = urllib.parse.urlunparse(
                    ("https", YANDEX_MUSIC_DOMAIN, f"/album/{safe_alb}/track/{safe_track}", "", "", ""))
                return RedirectResponse(url=url)
    return None


def _yandex_fallback_redirect(type: str, q: str):
    """Return a fallback search redirect for Yandex Music."""
    query_type = "artists"
    if type == "album":
        query_type = "albums"
    elif type == "track":
        query_type = "tracks"
    query = urllib.parse.urlencode({"text": q, "type": query_type})
    url = urllib.parse.urlunparse(("https", YANDEX_MUSIC_DOMAIN, "/search", "", query, ""))
    return RedirectResponse(url=url)  # NOSONAR


SuggestionQuery = Annotated[str, Query(max_length=200)]
# Profile links join two favourites (artist and album or track), 256 each
RedirectQuery = Annotated[str, Query(max_length=600)]
EntityType = Annotated[str, Query(max_length=20)]


@router.get("/api/redirect")
@limiter.limit(OUTBOUND_LIMIT)
async def smart_redirect(request: Request, source: Annotated[str, Query(max_length=20)],
                         type: EntityType, q: RedirectQuery):
    if source == "yandex":
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"https://api.music.yandex.net/search?text={urllib.parse.quote(q)}&type=all&page=0", headers={'User-Agent': USER_AGENT_MOZILLA}, timeout=5)
                if resp.status_code == 200:
                    res = resp.json().get("result", {})
                    direct = _yandex_redirect_for_type(type, res)
                    if direct:
                        return direct
        except Exception as e:
            logger.warning(f"Redirect error: {e}")
        return _yandex_fallback_redirect(type, q)

    return RedirectResponse(url=f"https://{YANDEX_MUSIC_DOMAIN}")


SUGGESTIONS_TTL_SEC = 600


@router.get("/api/search-suggestions")
@limiter.limit(OUTBOUND_LIMIT)
async def get_search_suggestions(request: Request, q: SuggestionQuery, type: EntityType):
    from app.services.metadata_search import search_suggestions
    # Typing in a search box repeats the same queries; answer them from the
    # cache instead of asking Deezer, Genius and Last.fm again
    key = f"suggestions:{type}:{q.strip().casefold()}"
    cached = get_from_cache(key, SUGGESTIONS_TTL_SEC)
    if cached is not None:
        return {"results": cached}
    suggestions = await search_suggestions(q, type)
    set_to_cache(key, suggestions, SUGGESTIONS_TTL_SEC)
    return {"results": suggestions}


# --- /api/user/{username}/compatibility/{target_username} ---
@router.get(
    "/api/user/{username}/compatibility/{target_username}",
    responses={403: {"description": "Private profile"}, 404: {"description": "User Not Found"}}
)
@limiter.limit(HEAVY_READ_LIMIT)
def get_user_taste_compatibility(
    username: str, target_username: str, request: Request, db: Annotated[Session, Depends(get_db)]
):
    """Calculate musical taste compatibility between two users."""
    from app.services.compatibility import calculate_compatibility

    u1 = _get_visible_user(username, request, db, "statistics")
    u2 = _get_visible_user(target_username, request, db, "statistics")

    result = calculate_compatibility(int(u1.id), int(u2.id), db, request_lang(request))
    return {
        "user1": username,
        "user2": target_username,
        **result
    }


# --- /api/recommendations ---
@router.get(
    "/api/recommendations/user/{username}",
    responses={404: {"description": "User Not Found"}}
)
@limiter.limit(HEAVY_READ_LIMIT)
def get_user_recommendations(
    username: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
):
    """Get smart recommendations for a specific user based on taste profile and vector similarities."""
    from app.services.recommendations import generate_smart_recommendations

    user = _get_visible_user(username, request, db, "statistics")

    return generate_smart_recommendations(user, db, limit=limit, use_feedback=False, lang=request_lang(request))


@router.get("/api/recommendations/me")
def get_my_recommendations(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
    novelty: Annotated[int, Query(ge=0, le=100)] = 50,
    avoid_recent: bool = False,
    recent_interest: Annotated[int, Query(ge=0, le=100)] = 50,
):
    """Get personalized smart recommendations for the authenticated user."""
    from app.services.recommendations import generate_smart_recommendations

    return generate_smart_recommendations(current_user, db, limit=limit, novelty=novelty, avoid_recent=avoid_recent, recent_interest=recent_interest,
                                          lang=request_lang(request, current_user))
