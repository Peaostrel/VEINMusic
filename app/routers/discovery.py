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
from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.database import get_db
from app.models import (
    User,
    UserProfile,
)
from app.routers.common import _check_privacy_and_owner, _get_visible_user
from app.services.cache import get_from_cache, set_to_cache
from app.services.taste import get_taste_match_internal, get_taste_twins

logger = logging.getLogger(__name__)

router = APIRouter(tags=["discovery"])

# --- /api/taste-match/{viewer}/{profile} ---


@router.get("/api/taste-match/{viewer}/{profile}")
def get_taste_match(viewer: str, profile: str, request: Request,
                    db: Annotated[Session, Depends(get_db)]):
    viewer_user = db.query(User).filter(User.username == viewer).first()
    profile_user = db.query(User).filter(User.username == profile).first()
    if not viewer_user or not profile_user or viewer == profile:
        return {"match": 0, "common_artists": []}
    # Never reveal listening data of a private profile to other users
    if (_check_privacy_and_owner(viewer_user, request, db)[0]
            or _check_privacy_and_owner(profile_user, request, db)[0]):
        return {"match": 0, "common_artists": []}

    # SQL-based artist intersection for performance
    sql = text("""
        SELECT DISTINCT t.artist
        FROM scrobbles s
        JOIN tracks t ON s.track_id = t.id
        WHERE s.user_id = :u1 AND s.listened_sec * 100 >= t.duration * 85
        INTERSECT
        SELECT DISTINCT t.artist
        FROM scrobbles s
        JOIN tracks t ON s.track_id = t.id
        WHERE s.user_id = :u2 AND s.listened_sec * 100 >= t.duration * 85
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
        WHERE (s.user_id = :u1 OR s.user_id = :u2) AND s.listened_sec * 100 >= t.duration * 85
    """)
    total_unique = db.execute(
        sql_total, {
            "u1": viewer_user.id, "u2": profile_user.id}).scalar() or 1

    match_percent = int((len(common_artists) / total_unique) * 100)
    return {"match": min(match_percent, 100),
            "common_artists": common_artists[:5]}


# --- /api/recommendations ---
@router.get("/api/recommendations",
            responses={404: {"description": "User not found"}})
def get_recommendations(
        username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = _get_visible_user(username, request, db)

    cache_key = f"recs_{username}"
    cached = get_from_cache(cache_key, ttl=1800)  # 30 min cache
    if cached:
        return cached
    twins = get_taste_twins(username, db)
    if not twins:
        return []
    twin_names = [t['username'] for t in twins]
    sql = text("""
        SELECT t.artist, t.cover_url, COUNT(s.id) as plays
        FROM scrobbles s
        JOIN tracks t ON s.track_id = t.id
        JOIN users u ON s.user_id = u.id
        WHERE u.username IN :twins
          AND t.artist NOT IN (
              SELECT DISTINCT t2.artist FROM scrobbles s2 JOIN tracks t2 ON s2.track_id = t2.id WHERE s2.user_id = :my_id
          )
        GROUP BY t.artist
        ORDER BY plays DESC
        LIMIT 10
    """)
    recs = db.execute(sql, {"twins": tuple(twin_names),
                      "my_id": user.id}).fetchall()
    data = [{"artist": r[0], "cover_url": r[1],
             "reason": "Слушают ваши вкусовые близнецы"} for r in recs]
    set_to_cache(cache_key, data)
    return data


# --- /api/search/taste ---
@router.get("/api/search/taste")
@limiter.limit("10/minute")
def search_by_taste(my_username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    _get_visible_user(my_username, request, db)
    # Find people with highest taste match (private profiles are excluded)
    all_users = db.query(User).join(UserProfile).filter(
        User.username != my_username,
        UserProfile.is_private.isnot(True)).limit(50).all()
    results = []
    for u in all_users:
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


@router.get("/api/redirect")
async def smart_redirect(source: str, type: str, q: str):
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


@router.get("/api/search-suggestions")
async def get_search_suggestions(q: str, type: str):
    from app.services.metadata_search import search_suggestions
    suggestions = await search_suggestions(q, type)
    return {"results": suggestions}


# --- /api/user/{username}/compatibility/{target_username} ---
@router.get(
    "/api/user/{username}/compatibility/{target_username}",
    responses={403: {"description": "Private profile"}, 404: {"description": "User Not Found"}}
)
def get_user_taste_compatibility(
    username: str, target_username: str, request: Request, db: Annotated[Session, Depends(get_db)]
):
    """Calculate musical taste compatibility between two users."""
    from app.services.compatibility import calculate_compatibility

    u1 = _get_visible_user(username, request, db)
    u2 = _get_visible_user(target_username, request, db)

    result = calculate_compatibility(int(u1.id), int(u2.id), db)
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
def get_user_recommendations(
    username: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
):
    """Get smart recommendations for a specific user based on taste profile and vector similarities."""
    from app.services.recommendations import generate_smart_recommendations

    user = _get_visible_user(username, request, db)

    return generate_smart_recommendations(user, db, limit=limit)


@router.get("/api/recommendations/me")
def get_my_recommendations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
):
    """Get personalized smart recommendations for the authenticated user."""
    from app.services.recommendations import generate_smart_recommendations

    return generate_smart_recommendations(current_user, db, limit=limit)
