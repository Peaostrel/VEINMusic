"""Leaderboard and the site-wide numbers of the landing page."""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.constants import ACTIVE_PLAYBACK_WINDOW_SEC
from app.core.rate_limit import HEAVY_READ_LIMIT, limiter
from app.core.security import get_current_user
from app.database import get_db
from app.models import Follow, Scrobble, Track, User, UserIntegration, UserProfile
from app.services.cache import get_from_cache, set_to_cache
from app.services.privacy import (
    audience_cache_key, public_statistics_users, visible_statistics_users,
)

router = APIRouter(tags=["stats"])

LEADERBOARD_CACHE_KEY = "leaderboard:raw:v3"
LEADERBOARD_CACHE_TTL = 60
LEADERBOARD_SIZE = 50
WEEK_CACHE_KEY = "public-week:v1"
WEEK_CACHE_TTL = 300
PUBLIC_STATS_CACHE_KEY = "public-stats:v1"
PUBLIC_STATS_TTL = 30


# --- /api/leaderboard ---
def _visible_ranking(ranking, db, viewer_id=None):
    public_names = visible_statistics_users(db, viewer_id)
    return [{**item, "rank": rank} for rank, item in enumerate(
        (entry for entry in ranking if entry["username"] in public_names), 1)]


def _full_ranking(db: Session, viewer_id: int | None = None) -> list[dict[str, Any]]:
    """Every non-banned user with total XP, best first, with a global rank.
    Aggregates over all scrobbles: cached briefly (shared through Redis)."""
    return _visible_ranking(_lifetime_ranking(db), db, viewer_id)


def _lifetime_ranking(db: Session) -> list[dict[str, Any]]:
    cached = get_from_cache(LEADERBOARD_CACHE_KEY, ttl=LEADERBOARD_CACHE_TTL)
    if cached is not None:
        return cached
    sql = text("""
        SELECT u.username, p.display_name, p.avatar_url, i.is_verified, p.theme,
               (COALESCE(SUM(s.xp_earned), 0) + COALESCE(i.bonus_xp, 0)) as total_xp, u.role
        FROM users u
        JOIN user_profiles p ON u.id = p.user_id
        JOIN user_integrations i ON u.id = i.user_id
        LEFT JOIN (
            SELECT s.user_id, s.xp_earned
            FROM scrobbles s
            JOIN tracks t ON s.track_id = t.id
            WHERE s.excluded_from_stats = false AND s.deleted_at IS NULL AND s.listened_sec * 100 >= COALESCE(NULLIF(t.duration, 0), 180) * 85
        ) s ON u.id = s.user_id
        WHERE (u.is_banned IS NULL OR u.is_banned = :not_banned)
        GROUP BY u.id, u.username, p.display_name, p.avatar_url, i.is_verified,
                 p.theme, i.bonus_xp, u.role
        ORDER BY total_xp DESC, u.username
    """)
    rows = db.execute(sql, {"not_banned": False, "not_private": False}).fetchall()
    ranking = []
    for rank, (uname, dname, avatar, verified, theme, txp, urole) in enumerate(rows, 1):
        ranking.append({
            "rank": rank,
            "username": uname,
            "display_name": dname or uname,
            "avatar_url": avatar,
            "total_xp": txp,
            "level": (txp // 100) + 1,
            "is_verified": verified,
            "role": urole or "user",
            "theme": theme
        })
    set_to_cache(LEADERBOARD_CACHE_KEY, ranking)
    return ranking


def _period_ranking(db: Session, period: str, viewer_id: int | None = None) -> list[dict[str, Any]]:
    if period == "all":
        return _full_ranking(db, viewer_id)
    return _visible_ranking(_recent_ranking(db, period), db, viewer_id)


def _recent_ranking(db: Session, period: str) -> list[dict[str, Any]]:
    """XP of the last 7 or 30 days of every non-banned user, before privacy
    filtering. Sums a month of everyone's plays: cached like the lifetime
    ranking, otherwise every page view (and /me, /following) recounts it."""
    key = f"{LEADERBOARD_CACHE_KEY}:{period}"
    cached = get_from_cache(key, ttl=LEADERBOARD_CACHE_TTL)
    if cached is not None:
        return cached
    lifetime_levels = {entry["username"]: entry["level"] for entry in _lifetime_ranking(db)}
    days = 7 if period == "7d" else 30
    start = datetime.now(UTC) - timedelta(days=days)
    xp = (
        db.query(
            Scrobble.user_id.label("user_id"),
            func.coalesce(func.sum(Scrobble.xp_earned), 0).label("total_xp"),
        )
        .join(Track, Track.id == Scrobble.track_id)
        .filter(
            Scrobble.played_at >= start,
            Scrobble.listened_sec * 100
            >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
        )
        .group_by(Scrobble.user_id)
        .subquery()
    )
    rows = (
        db.query(
            User,
            UserProfile,
            UserIntegration,
            func.coalesce(xp.c.total_xp, 0).label("period_xp"),
        )
        .join(UserProfile, UserProfile.user_id == User.id)
        .join(UserIntegration, UserIntegration.user_id == User.id)
        .outerjoin(xp, xp.c.user_id == User.id)
        .filter(
            User.is_banned.isnot(True),
            xp.c.total_xp.isnot(None),
        )
        .order_by(func.coalesce(xp.c.total_xp, 0).desc(), User.username)
        .all()
    )
    ranking = [
        {
            "rank": rank,
            "username": user.username,
            "display_name": profile.display_name or user.username,
            "avatar_url": profile.avatar_url,
            "total_xp": int(total_xp),
            "level": lifetime_levels.get(user.username, 1),
            "is_verified": integration.is_verified,
            "role": user.role or "user",
            "theme": profile.theme,
        }
        for rank, (user, profile, integration, total_xp) in enumerate(rows, 1)
    ]
    set_to_cache(key, ranking, expire=LEADERBOARD_CACHE_TTL * 2)
    return ranking


@router.get("/api/leaderboard")
@limiter.limit(HEAVY_READ_LIMIT)
def get_leaderboard(
        request: Request,
        db: Annotated[Session, Depends(get_db)],
        period: Literal["7d", "30d", "all"] = "all"):
    return _period_ranking(db, period)[:LEADERBOARD_SIZE]


@router.get("/api/leaderboard/following",
            responses={401: {"description": "Not authenticated"}})
def get_leaderboard_following(
        db: Annotated[Session, Depends(get_db)],
        current_user: Annotated[User, Depends(get_current_user)],
        period: Literal["7d", "30d", "all"] = "all"):
    """The signed-in user and everyone they follow, with global ranks."""
    ids = [current_user.id] + [
        f[0] for f in db.query(Follow.following_id).filter(
            Follow.follower_id == current_user.id).all()]
    names = {u[0] for u in db.query(User.username).filter(User.id.in_(ids)).all()}
    return [e for e in _period_ranking(db, period, int(current_user.id)) if e["username"] in names][:LEADERBOARD_SIZE]


@router.get("/api/leaderboard/me",
            responses={401: {"description": "Not authenticated"}})
def get_my_rank(
        db: Annotated[Session, Depends(get_db)],
        current_user: Annotated[User, Depends(get_current_user)],
        period: Literal["7d", "30d", "all"] = "all"):
    """Global place of the signed-in user and the gap to the place above."""
    ranking = _period_ranking(db, period, int(current_user.id))
    mine = next((e for e in ranking if e["username"] == current_user.username), None)
    if mine is None:  # banned users are not ranked
        return {"rank": None, "total": len(ranking), "total_xp": 0, "ahead": None}
    ahead = ranking[mine["rank"] - 2] if mine["rank"] > 1 else None
    return {
        "rank": mine["rank"],
        "total": len(ranking),
        "total_xp": mine["total_xp"],
        "ahead": None if ahead is None else {
            "username": ahead["username"],
            "display_name": ahead["display_name"],
            "gap_xp": max(0, ahead["total_xp"] - mine["total_xp"]),
        },
    }


# --- /api/public-stats ---
@router.get("/api/public-stats")
@limiter.limit(HEAVY_READ_LIMIT)
def get_public_stats(request: Request, db: Annotated[Session, Depends(get_db)]):
    # The landing page asks on every visit; counting all plays each time
    # would let anyone keep the database busy
    cached = get_from_cache(PUBLIC_STATS_CACHE_KEY, ttl=PUBLIC_STATS_TTL)
    if cached is not None:
        return cached
    total_users = db.query(User).count()
    total_scrobbles = db.query(Scrobble).join(Track).filter(
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).count()
    total_tracks = db.query(Track).count()

    # Count only recent playback from public, non-banned listeners.
    active_since = datetime.now(UTC) - timedelta(seconds=ACTIVE_PLAYBACK_WINDOW_SEC)
    latest_scrobbles = db.query(
        func.max(Scrobble.id).label("id")
    ).group_by(Scrobble.user_id).subquery()
    online_count = db.query(
        func.count(Scrobble.id)).join(
        latest_scrobbles, latest_scrobbles.c.id == Scrobble.id
    ).join(User).join(UserProfile).filter(
        Scrobble.updated_at >= active_since,
        Scrobble.is_playing.is_(True),
        UserProfile.is_private.isnot(True),
        User.is_banned.isnot(True)).scalar() or 0

    result = {
        "total_users": total_users,
        "total_scrobbles": total_scrobbles,
        "total_tracks": total_tracks,
        "online": online_count}
    set_to_cache(PUBLIC_STATS_CACHE_KEY, result, PUBLIC_STATS_TTL)
    return result


def _completed_scrobble():
    """A scrobble counts once 85% of the track was heard (as in the XP rules)."""
    return Scrobble.listened_sec * 100 >= func.coalesce(
        func.nullif(Track.duration, 0), 180) * 85


@router.get("/api/public-stats/week")
@limiter.limit(HEAVY_READ_LIMIT)
def get_public_week(request: Request, db: Annotated[Session, Depends(get_db)]):
    """Site-wide listening over the last 7 days (UTC) for the landing page:
    plays per day, hours of music and the artist of the week. Only public,
    non-banned profiles count, so no private history leaks out."""
    public_ids = list(public_statistics_users(db).values())
    cache_key = audience_cache_key(WEEK_CACHE_KEY, public_ids)
    cached = get_from_cache(cache_key, ttl=WEEK_CACHE_TTL)
    if cached is not None:
        return cached
    today = datetime.now(UTC).date()
    first_day = today - timedelta(days=6)
    since = datetime.combine(first_day, datetime.min.time(), tzinfo=UTC)
    base = (db.query(Scrobble)
            .join(Track, Scrobble.track_id == Track.id)
            .join(User, Scrobble.user_id == User.id)
            .join(UserProfile, UserProfile.user_id == User.id)
            .filter(Scrobble.user_id.in_(public_ids), Scrobble.played_at >= since,
                    _completed_scrobble(),
                    UserProfile.is_private.isnot(True),
                    User.is_banned.isnot(True)))
    day = func.date(Scrobble.played_at)
    per_day = {str(d): n for d, n in
               base.with_entities(day, func.count(Scrobble.id)).group_by(day).all()}
    seconds = base.with_entities(
        func.coalesce(func.sum(Scrobble.listened_sec), 0)).scalar() or 0
    plays = func.count(Scrobble.id)
    top = (base.with_entities(Track.artist, plays)
           .group_by(Track.artist).order_by(plays.desc(), Track.artist).first())
    days = []
    for offset in range(7):
        d = (first_day + timedelta(days=offset)).isoformat()
        days.append({"date": d, "plays": per_day.get(d, 0)})
    result = {
        "from": first_day.isoformat(),
        "to": today.isoformat(),
        "days": days,
        "total_plays": sum(x["plays"] for x in days),
        "hours": round(seconds / 3600, 1),
        "top_artist": None if top is None else {"name": top[0], "plays": top[1]},
    }
    set_to_cache(cache_key, result, expire=WEEK_CACHE_TTL * 2)
    return result
