"""Listening statistics, leaderboard and global feed."""

from datetime import UTC, datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Depends,
    Request,
)
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.constants import ORDER_PLAYS_DESC
from app.database import get_db
from app.models import (
    Scrobble,
    Track,
    User,
    UserProfile,
)
from app.routers.common import _check_privacy_and_owner, _get_visible_user
from app.services.cache import get_from_cache, set_to_cache
from app.services.scrobble_processor import format_history_item
from app.services.user_stats import (
    get_active_streak,
    get_user_level_info,
    get_user_timezone_offset,
)

router = APIRouter(tags=["stats"])

LEADERBOARD_CACHE_KEY = "leaderboard:v1"
LEADERBOARD_CACHE_TTL = 60

# --- /api/stats/wrapped ---


@router.get("/api/stats/wrapped",
            responses={404: {"description": "User not found"}})
def get_wrapped_stats(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = _get_visible_user(username, request, db)
    last_month = datetime.now(UTC) - timedelta(days=30)
    base_filter = [
        Scrobble.user_id == user.id,
        Scrobble.played_at >= last_month,
        Scrobble.listened_sec *
        100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85]
    top_artist = db.query(
        Track.artist,
        func.count(
            Scrobble.id)).join(Scrobble).filter(
        *
        base_filter).group_by(
                Track.artist).order_by(
                    text('count_1 DESC')).first()
    total_min = db.query(
        func.sum(
            Scrobble.listened_sec)).join(Track).filter(
        *base_filter).scalar() or 0
    return {
        "period": "За последние 30 дней",
        "top_artist": top_artist[0] if top_artist else "Нет данных",
        "total_minutes": int(total_min // 60),
        "status": "Legendary" if total_min > 5000 else "Active"
    }


# --- /api/feed/global ---
@router.get("/api/feed/global")
def get_global_feed(db: Annotated[Session, Depends(get_db)]):
    # Latest scrobbles from public users
    scrobbles = db.query(Scrobble).join(User).join(UserProfile).filter(
        UserProfile.is_private.is_(False)).order_by(
        Scrobble.id.desc()).limit(20).all()
    return {"feed": [format_history_item(s, s.track) for s in scrobbles]}


def _get_activity_stats(
        db: Session, base_filter) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    try:
        is_postgres = db.get_bind().dialect.name == "postgresql"
    except Exception:  # NOSONAR
        is_postgres = True

    if is_postgres:
        hours_raw = db.query(
            func.to_char(
                Scrobble.played_at,
                'HH24'),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.to_char(
                        Scrobble.played_at,
                        'HH24')).all()
        days_raw = db.query(
            func.to_char(
                Scrobble.played_at,
                'ID'),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.to_char(
                        Scrobble.played_at,
                        'ID')).all()
        graph_raw = db.query(
            func.to_char(
                Scrobble.played_at,
                'YYYY-MM-DD'),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.to_char(
                        Scrobble.played_at,
                        'YYYY-MM-DD')).all()
        day_names = {
            '1': 'Пн',
            '2': 'Вт',
            '3': 'Ср',
            '4': 'Чт',
            '5': 'Пт',
            '6': 'Сб',
            '7': 'Вс'}
    else:
        hours_raw = db.query(
            func.strftime(
                '%H',
                Scrobble.played_at),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.strftime(
                        '%H',
                        Scrobble.played_at)).all()
        days_raw = db.query(
            func.strftime(
                '%w',
                Scrobble.played_at),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.strftime(
                        '%w',
                        Scrobble.played_at)).all()
        graph_raw = db.query(
            func.strftime(
                '%Y-%m-%d',
                Scrobble.played_at),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.strftime(
                        '%Y-%m-%d',
                        Scrobble.played_at)).all()
        day_names = {
            '1': 'Пн',
            '2': 'Вт',
            '3': 'Ср',
            '4': 'Чт',
            '5': 'Пт',
            '6': 'Сб',
            '0': 'Вс'}

    hours_activity = {f"{i:02d}": 0 for i in range(24)}
    for h, count in hours_raw:
        if h is not None:
            hours_activity[h] = count

    days_activity = dict.fromkeys(
        ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], 0)
    for d, count in days_raw:
        if d in day_names:
            days_activity[day_names[d]] = count

    activity_graph = {
        date: count for date,
        count in graph_raw if date is not None}
    return hours_activity, days_activity, activity_graph


# --- /api/detailed-stats/{username} ---
@router.get("/api/detailed-stats/{username}",
            responses={404: {"description": "User not found"}})
def get_detailed_stats(username: str,
                       request: Request,
                       db: Annotated[Session,
                                     Depends(get_db)],
                       period: str = "all"):
    user = _get_visible_user(username, request, db)

    base_filter = [
        Scrobble.user_id == user.id,
        Scrobble.listened_sec *
        100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85]
    if period == "7d":
        base_filter.append(
            Scrobble.played_at >= datetime.now(
                UTC) -
            timedelta(
                days=7))
    elif period == "30d":
        base_filter.append(
            Scrobble.played_at >= datetime.now(
                UTC) -
            timedelta(
                days=30))

    # 1. General Stats
    total_scrobbles = db.query(
        func.count(
            Scrobble.id)).join(Track).filter(
        *base_filter).scalar() or 0
    total_sec = db.query(
        func.sum(
            Scrobble.listened_sec)).join(Track).filter(
        *base_filter).scalar() or 0
    unique_artists = db.query(
        func.count(
            func.distinct(
                Track.artist))).join(Scrobble).filter(
        *base_filter).scalar() or 0
    unique_tracks = db.query(
        func.count(
            func.distinct(
                Track.id))).join(Scrobble).filter(
        *base_filter).scalar() or 0

    # 2. Top Artists
    top_artists_raw = db.query(
        Track.artist,
        func.count(
            Scrobble.id).label('plays'),
        func.max(
            Scrobble.source).label('source')) .join(Scrobble).filter(
                *
                base_filter).group_by(
                    Track.artist) .order_by(
                        text(ORDER_PLAYS_DESC)).limit(10).all()

    # 3. Top Tracks
    top_tracks_raw = db.query(
        Track.title,
        Track.artist,
        Track.cover_url,
        Track.track_url,
        func.count(
            Scrobble.id).label('plays'),
        func.max(
            Scrobble.source).label('source')) .join(Scrobble).filter(
                *
                base_filter).group_by(
                    Track.id,
                    Track.title,
                    Track.artist,
                    Track.cover_url,
                    Track.track_url) .order_by(
                        text(ORDER_PLAYS_DESC)).limit(10).all()

    # 4. Top Albums
    top_albums_raw = db.query(
        Track.album,
        Track.artist,
        Track.cover_url,
        func.count(
            Scrobble.id).label('plays'),
        func.max(
            Scrobble.source).label('source')) .join(Scrobble).filter(
                *
                base_filter,
                Track.album.isnot(None)) .group_by(
                    Track.album,
                    Track.artist,
                    Track.cover_url) .order_by(
                        text(ORDER_PLAYS_DESC)).limit(10).all()

    # 5. Genre & Source counts
    genres = db.query(
        Track.genre,
        func.count(
            Scrobble.id)).join(Scrobble).filter(
        *
        base_filter,
        Track.genre.isnot(None)).group_by(
                Track.genre).all()
    sources = db.query(
        Scrobble.source,
        func.count(
            Scrobble.id)).join(Track).filter(
        *
        base_filter).group_by(
                Scrobble.source).all()

    # 6. Activity
    hours_activity, days_activity, activity_graph = _get_activity_stats(
        db, base_filter)

    return {"user": {"username": user.username,
                     "display_name": user.profile.display_name or user.username,
                     "avatar_url": user.profile.avatar_url},
            "total_time_min": int(total_sec // 60),
            "total_scrobbles": total_scrobbles,
            "unique_artists": unique_artists,
            "unique_tracks": unique_tracks,
            "top_artists": [{"name": r[0],
                             "plays": r[1],
                             "source": r[2]} for r in top_artists_raw],
            "top_tracks": [{"title": r[0],
                            "artist": r[1],
                            "cover_url": r[2],
                            "track_url": r[3],
                            "plays": r[4],
                            "source": r[5]} for r in top_tracks_raw],
            "top_albums": [{"album": r[0],
                            "artist": r[1],
                            "cover_url": r[2],
                            "plays": r[3],
                            "source": r[4]} for r in top_albums_raw],
            "genre_counts": dict(tuple(r) for r in genres),
            "source_counts": dict(tuple(r) for r in sources),
            "activity_graph": activity_graph,
            "hours_activity": hours_activity,
            "days_activity": days_activity}


# --- /api/stats/{username} ---


@router.get("/api/stats/{username}",
            responses={404: {"description": "User not found"}})
def get_stats(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = _get_visible_user(username, request, db)
    streak = get_active_streak(user)

    # Aggregate in SQL (per track and source) instead of loading every
    # scrobble of the user into memory.
    rows = db.query(
        Track.artist, Track.title, Track.cover_url, Track.track_url,
        Scrobble.source,
        func.count(Scrobble.id),
        func.coalesce(func.sum(Scrobble.xp_earned), 0),
    ).join(Track).filter(
        Scrobble.user_id == user.id,
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85
    ).group_by(
        Track.id, Track.artist, Track.title, Track.cover_url, Track.track_url, Scrobble.source
    ).all()

    total_scrobbles = sum(int(r[5]) for r in rows)
    scrobbles_xp = sum(int(r[6]) for r in rows)
    base_xp = scrobbles_xp + (user.integration.bonus_xp or 0)
    total_xp = int(base_xp * 1.1) if streak >= 7 else base_xp

    artist_counts: dict[str, dict[str, Any]] = {}
    track_counts: dict[str, dict[str, Any]] = {}
    track_meta: dict[str, dict[str, Any]] = {}

    for t_artist, t_title, t_cover, t_url, source, plays, _xp in rows:
        plays = int(plays)
        t_artist = t_artist or ""
        t_title = t_title or ""
        for a in t_artist.split(','):
            a_clean = a.strip()
            if a_clean not in artist_counts:
                artist_counts[a_clean] = {"plays": 0, "sources": {}}
            artist_counts[a_clean]["plays"] += plays
            artist_counts[a_clean]["sources"][source] = artist_counts[a_clean]["sources"].get(
                source, 0) + plays

        track_key = f"{t_artist.strip().lower()} - {t_title.strip().lower()}"
        if track_key not in track_counts:
            track_counts[track_key] = {"plays": 0, "sources": {}}
        track_counts[track_key]["plays"] += plays
        track_counts[track_key]["sources"][source] = track_counts[track_key]["sources"].get(
            source, 0) + plays

        if track_key not in track_meta:
            track_meta[track_key] = {
                "title": t_title,
                "artist": t_artist,
                "cover_url": t_cover,
                "track_url": t_url}

    top_artists = sorted(
        artist_counts.items(),
        key=lambda x: (
            x[1]["plays"],
            x[0]),
        reverse=True)[
            :5]
    top_tracks = sorted(
        track_counts.items(),
        key=lambda x: (
            x[1]["plays"],
            x[0]),
        reverse=True)[
            :5]

    return {"total_scrobbles": total_scrobbles,
            "total_xp": total_xp,
            "top_tracks": [{"title": track_meta[tkey]["title"],
                            "artist": track_meta[tkey]["artist"],
                            "cover_url": track_meta[tkey]["cover_url"],
                            "track_url": track_meta[tkey]["track_url"],
                            "plays": v["plays"],
                            "source": max(v["sources"].items(),
                                          key=lambda elem: elem[1])[0]} for tkey,
                           v in top_tracks],
            "top_artists": [{"artist": k,
                             "plays": v["plays"],
                             "source": max(v["sources"].items(),
                                           key=lambda elem: elem[1])[0]} for k,
                            v in top_artists]}


# --- /api/activity/{username} ---
@router.get("/api/activity/{username}",
            responses={404: {"description": "User not found"}})
def get_activity(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = _get_visible_user(username, request, db)

    scrobbles = db.query(Scrobble.played_at).join(Track).filter(
        Scrobble.user_id == user.id,
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85
    ).all()

    user_tz = timezone(timedelta(hours=get_user_timezone_offset(
        user.profile.location if user.profile else "")))
    activity_dict: dict[str, int] = {}
    for (played_at,) in scrobbles:
        if played_at.tzinfo is None:
            played_at = played_at.replace(tzinfo=UTC)
        local_dt = played_at.astimezone(user_tz)
        date_str = local_dt.strftime('%Y-%m-%d')
        activity_dict[date_str] = activity_dict.get(date_str, 0) + 1

    return activity_dict


# --- /api/current-track/{username} ---
@router.get("/api/current-track/{username}")
def get_current_track(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user or _check_privacy_and_owner(user, request, db)[0]:
        return {"playing": False}

    last_scrobble = db.query(
        Scrobble,
        Track).join(Track).filter(
        Scrobble.user_id == user.id).order_by(
            Scrobble.id.desc()).first()

    if not last_scrobble:
        return {"playing": False}

    s, t = last_scrobble
    last_seen = s.updated_at or s.played_at
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)
    is_active = s.is_playing and (datetime.now(UTC) - last_seen).total_seconds() < 900

    if is_active:
        lvl, rank, _, _ = get_user_level_info(user, db)
        return {
            "playing": True,
            "title": t.title,
            "artist": t.artist,
            "cover_url": t.cover_url,
            "level": lvl,
            "rank": rank
        }
    return {"playing": False}


# --- /api/leaderboard ---
@router.get("/api/leaderboard")
def get_leaderboard(db: Annotated[Session, Depends(get_db)]):
    # Aggregates over all scrobbles: cache briefly (shared through Redis)
    cached = get_from_cache(LEADERBOARD_CACHE_KEY, ttl=LEADERBOARD_CACHE_TTL)
    if cached is not None:
        return cached
    # Calculate XP for all users in one query
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
            WHERE s.listened_sec * 100 >= COALESCE(NULLIF(t.duration, 0), 180) * 85
        ) s ON u.id = s.user_id
        WHERE (u.is_banned IS NULL OR u.is_banned = :not_banned)
        GROUP BY u.id, p.display_name, p.avatar_url, i.is_verified, p.theme, i.bonus_xp, u.role
        ORDER BY total_xp DESC
        LIMIT 50
    """)

    rows = db.execute(sql, {"not_banned": False}).fetchall()
    res = []
    for r in rows:
        uname, dname, avatar, verified, theme, txp, urole = r
        lvl = (txp // 100) + 1
        res.append({
            "username": uname,
            "display_name": dname or uname,
            "avatar_url": avatar,
            "total_xp": txp,
            "level": lvl,
            "is_verified": verified,
            "role": urole or "user",
            "theme": theme
        })
    set_to_cache(LEADERBOARD_CACHE_KEY, res)
    return res


# --- /api/public-stats ---
@router.get("/api/public-stats")
def get_public_stats(db: Annotated[Session, Depends(get_db)]):
    total_users = db.query(User).count()
    total_scrobbles = db.query(Scrobble).join(Track).filter(
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).count()
    total_tracks = db.query(Track).count()

    # Считаем онлайн за последние 5 минут
    five_mins_ago = datetime.now(UTC) - timedelta(minutes=5)
    online_count = db.query(
        func.count(
            func.distinct(
                Scrobble.user_id))).filter(
        Scrobble.updated_at >= five_mins_ago).scalar() or 0

    return {
        "total_users": total_users,
        "total_scrobbles": total_scrobbles,
        "total_tracks": total_tracks,
        "online": online_count}
