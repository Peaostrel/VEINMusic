"""Listening statistics, leaderboard and global feed."""

from collections import Counter
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Annotated, Any, Literal

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.constants import ACTIVE_PLAYBACK_WINDOW_SEC, ORDER_PLAYS_DESC
from app.core.security import get_current_user
from app.database import get_db
from app.models import (
    Follow,
    Scrobble,
    Track,
    User,
    UserIntegration,
    UserProfile,
)
from app.routers.common import (
    _can_view_section,
    _check_privacy_and_owner,
    _get_visible_user,
)
from app.services.cache import get_from_cache, set_to_cache
from app.services.scrobble_processor import format_history_item
from app.services.privacy import (
    audience_cache_key, filter_public_feed, public_feed_user_ids,
    public_statistics_users, visible_statistics_users,
)
from app.services.user_preferences import preference_enabled, preferences_dict
from app.services.user_stats import (
    get_active_streak,
    get_user_level_info,
    get_user_timezone_offset,
)

router = APIRouter(tags=["stats"])

LEADERBOARD_CACHE_KEY = "leaderboard:raw:v3"
LEADERBOARD_CACHE_TTL = 60
LEADERBOARD_SIZE = 50
WEEK_CACHE_KEY = "public-week:v1"
WEEK_CACHE_TTL = 300
MAX_CUSTOM_PERIOD_DAYS = 366


def _user_timezone(user: User) -> timezone:
    location = user.profile.location if user.profile else ""
    return timezone(timedelta(hours=get_user_timezone_offset(location)))


def _period_bounds(
        user: User,
        period: str,
        date_from: str | None,
        date_to: str | None) -> tuple[datetime | None, datetime | None, str]:
    """UTC bounds (end exclusive) and a human-readable period label."""
    user_tz = _user_timezone(user)
    now_local = datetime.now(UTC).astimezone(user_tz)
    labels = {
        "7d": "За последние 7 дней",
        "30d": "За последние 30 дней",
        "90d": "За последние 3 месяца",
        "year": f"С начала {now_local.year} года",
        "all": "За всё время",
        "custom": "Выбранный период",
    }
    if period not in labels:
        raise HTTPException(422, "Неизвестный период")
    if period == "all":
        return None, None, labels[period]

    if period == "custom":
        if not date_from or not date_to:
            raise HTTPException(422, "Укажите начало и конец периода")
        try:
            first = date.fromisoformat(date_from)
            last = date.fromisoformat(date_to)
        except ValueError as exc:
            raise HTTPException(422, "Дата должна быть в формате YYYY-MM-DD") from exc
        if first > last:
            raise HTTPException(422, "Начало периода не может быть позже конца")
        if (last - first).days + 1 > MAX_CUSTOM_PERIOD_DAYS:
            raise HTTPException(422, "Период не может быть длиннее 366 дней")
        start_local = datetime.combine(first, datetime.min.time(), tzinfo=user_tz)
        end_local = datetime.combine(last + timedelta(days=1), datetime.min.time(), tzinfo=user_tz)
        label = f"{first.strftime('%d.%m.%Y')} — {last.strftime('%d.%m.%Y')}"
        return start_local.astimezone(UTC), end_local.astimezone(UTC), label

    end_local = datetime.combine(
        now_local.date() + timedelta(days=1), datetime.min.time(), tzinfo=user_tz)
    if period == "year":
        start_local = datetime(now_local.year, 1, 1, tzinfo=user_tz)
    else:
        days = {"7d": 7, "30d": 30, "90d": 90}[period]
        start_local = datetime.combine(
            now_local.date() - timedelta(days=days - 1),
            datetime.min.time(),
            tzinfo=user_tz,
        )
    return start_local.astimezone(UTC), end_local.astimezone(UTC), labels[period]


def _local_period_dates(
        user: User,
        start: datetime | None,
        end: datetime | None) -> tuple[str | None, str | None]:
    """Inclusive local calendar dates for API metadata."""
    if start is None or end is None:
        return None, None
    user_tz = _user_timezone(user)
    return (
        start.astimezone(user_tz).date().isoformat(),
        (end - timedelta(microseconds=1)).astimezone(user_tz).date().isoformat(),
    )


def _counted_filter(user_id: int, start: datetime | None = None, end: datetime | None = None):
    filters = [
        Scrobble.user_id == user_id,
        Scrobble.listened_sec * 100
        >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
    ]
    if start is not None:
        filters.append(Scrobble.played_at >= start)
    if end is not None:
        filters.append(Scrobble.played_at < end)
    return filters


def _period_totals(db: Session, filters) -> dict[str, int]:
    row = db.query(
        func.count(Scrobble.id),
        func.coalesce(func.sum(Scrobble.listened_sec), 0),
        func.count(func.distinct(Track.artist)),
        func.count(func.distinct(Track.id)),
    ).join(Track).filter(*filters).one()
    return {
        "scrobbles": int(row[0] or 0),
        "minutes": int((row[1] or 0) // 60),
        "artists": int(row[2] or 0),
        "tracks": int(row[3] or 0),
    }


def _change_percent(current: int, previous: int) -> int | None:
    if previous == 0:
        return None if current > 0 else 0
    return round((current - previous) / previous * 100)


def _period_comparison(
        db: Session,
        user_id: int,
        start: datetime | None,
        end: datetime | None,
        current: dict[str, int]) -> dict[str, Any] | None:
    if start is None or end is None:
        return None
    duration = end - start
    previous = _period_totals(db, _counted_filter(user_id, start - duration, start))
    return {
        "previous": previous,
        "change": {key: _change_percent(current[key], previous[key]) for key in current},
    }


def _new_artist_count(db: Session, user_id: int, start: datetime | None, end: datetime | None) -> int:
    if start is None:
        return 0
    current_artists = {
        row[0] for row in db.query(Track.artist).join(Scrobble).filter(
            *_counted_filter(user_id, start, end)).distinct().all() if row[0]
    }
    if not current_artists:
        return 0
    known_before = {
        row[0] for row in db.query(Track.artist).join(Scrobble).filter(
            *_counted_filter(user_id, None, start),
            Track.artist.in_(list(current_artists))).distinct().all() if row[0]
    }
    return len(current_artists - known_before)

# --- /api/stats/wrapped ---


@router.get("/api/stats/wrapped",
            responses={404: {"description": "User not found"}})
def get_wrapped_stats(
        username: str,
        request: Request,
        db: Annotated[Session, Depends(get_db)],
        period: str = "30d",
        date_from: str | None = None,
        date_to: str | None = None):
    user = _get_visible_user(username, request, db, "statistics")
    period_start, period_end, period_label = _period_bounds(
        user, period, date_from, date_to)
    base_filter = _counted_filter(int(user.id), period_start, period_end)
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
    totals = _period_totals(db, base_filter)
    hours_activity, days_activity, activity_graph = _get_activity_stats(
        db, base_filter, get_user_timezone_offset(
            user.profile.location if user.profile else ""))
    del hours_activity, days_activity
    peak_day = None
    if activity_graph:
        peak_date, peak_count = max(
            activity_graph.items(), key=lambda item: (item[1], item[0]))
        peak_day = {"date": peak_date, "scrobbles": peak_count}
    return {
        "period": period_label,
        "top_artist": top_artist[0] if top_artist else "Нет данных",
        "total_minutes": int(total_min // 60),
        "status": "Legendary" if total_min > 5000 else "Active",
        "total_scrobbles": totals["scrobbles"],
        "unique_artists": totals["artists"],
        "unique_tracks": totals["tracks"],
        "new_artists": _new_artist_count(
            db, int(user.id), period_start, period_end),
        "peak_day": peak_day,
        "comparison": _period_comparison(
            db, int(user.id), period_start, period_end, totals),
    }


# --- /api/feed/global ---
@router.get("/api/feed/global")
def get_global_feed(db: Annotated[Session, Depends(get_db)]):
    # Latest scrobbles from public users
    scrobbles = db.query(Scrobble).join(User).join(UserProfile).filter(
        UserProfile.is_private.is_(False), User.is_banned.isnot(True),
        User.id.in_(public_feed_user_ids(db))).order_by(
        Scrobble.id.desc()).limit(100).all()
    visible = [
        scrobble for scrobble in scrobbles
        if preference_enabled(scrobble.user.profile, "feed", "share_scrobbles")
    ]
    feed = []
    for scrobble in visible:
        item = format_history_item(scrobble, scrobble.track)
        current_track_public = (
            preferences_dict(scrobble.user.profile)["privacy"]["current_track"]
            == "all"
        )
        show_online = preference_enabled(
            scrobble.user.profile, "profile", "show_online_status"
        )
        if item["is_playing"] and (not current_track_public or not show_online):
            continue
        if not preference_enabled(
                scrobble.user.profile, "privacy", "show_listening_source"):
            item["source"] = ""
        item["can_like"] = preference_enabled(
            scrobble.user.profile, "feed", "allow_likes")
        item["can_comment"] = preference_enabled(
            scrobble.user.profile, "feed", "allow_comments")
        feed.append(item)
    return {"feed": filter_public_feed(feed, db)[:20]}


def _get_activity_stats(
        db: Session,
        base_filter,
        timezone_offset: int = 0) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    try:
        is_postgres = db.get_bind().dialect.name == "postgresql"
    except Exception:  # NOSONAR
        is_postgres = True

    timezone_offset = max(-12, min(14, int(timezone_offset)))
    if is_postgres:
        local_played_at = Scrobble.played_at + timedelta(hours=timezone_offset)
        hours_raw = db.query(
            func.to_char(
                local_played_at,
                'HH24'),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.to_char(
                        local_played_at,
                        'HH24')).all()
        days_raw = db.query(
            func.to_char(
                local_played_at,
                'ID'),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.to_char(
                        local_played_at,
                        'ID')).all()
        graph_raw = db.query(
            func.to_char(
                local_played_at,
                'YYYY-MM-DD'),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.to_char(
                        local_played_at,
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
        local_played_at = func.datetime(
            Scrobble.played_at, f"{timezone_offset:+d} hours")
        hours_raw = db.query(
            func.strftime(
                '%H',
                local_played_at),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.strftime(
                        '%H',
                        local_played_at)).all()
        days_raw = db.query(
            func.strftime(
                '%w',
                local_played_at),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.strftime(
                        '%w',
                        local_played_at)).all()
        graph_raw = db.query(
            func.strftime(
                '%Y-%m-%d',
                local_played_at),
            func.count(
                Scrobble.id)).join(Track).filter(
            *
            base_filter).group_by(
                    func.strftime(
                        '%Y-%m-%d',
                        local_played_at)).all()
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
                       period: str = "all",
                       date_from: str | None = None,
                       date_to: str | None = None):
    user = _get_visible_user(username, request, db, "statistics")
    period_start, period_end, period_label = _period_bounds(
        user, period, date_from, date_to)
    base_filter = _counted_filter(int(user.id), period_start, period_end)

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
        db, base_filter, get_user_timezone_offset(
            user.profile.location if user.profile else ""))

    current_totals = {
        "scrobbles": int(total_scrobbles),
        "minutes": int(total_sec // 60),
        "artists": int(unique_artists),
        "tracks": int(unique_tracks),
    }
    comparison = _period_comparison(
        db, int(user.id), period_start, period_end, current_totals)
    peak_day = None
    if activity_graph:
        peak_date, peak_count = max(
            activity_graph.items(), key=lambda item: (item[1], item[0]))
        peak_day = {"date": peak_date, "scrobbles": peak_count}
    local_start, local_end = _local_period_dates(
        user, period_start, period_end)

    return {"user": {"username": user.username,
                     "display_name": user.profile.display_name or user.username,
                     "avatar_url": user.profile.avatar_url},
            "period": {"id": period,
                       "label": period_label,
                       "start": local_start,
                       "end": local_end},
            "total_time_min": int(total_sec // 60),
            "total_scrobbles": total_scrobbles,
            "unique_artists": unique_artists,
            "unique_tracks": unique_tracks,
            "new_artists": _new_artist_count(
                db, int(user.id), period_start, period_end),
            "peak_day": peak_day,
            "comparison": comparison,
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
    user = _get_visible_user(username, request, db, "statistics")
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
    user = _get_visible_user(username, request, db, "statistics")

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


def _longest_day_streak(day_keys: list[str]) -> int:
    longest = current = 0
    previous: date | None = None
    for key in sorted(day_keys):
        current_day = date.fromisoformat(key)
        current = current + 1 if previous and current_day - previous == timedelta(days=1) else 1
        longest = max(longest, current)
        previous = current_day
    return longest


# --- /api/stats/calendar/{username} ---
@router.get("/api/stats/calendar/{username}",
            responses={404: {"description": "User not found"}})
def get_listening_calendar(
        username: str,
        request: Request,
        db: Annotated[Session, Depends(get_db)],
        year: int | None = None):
    """One calendar year of listening, grouped in the user's local timezone."""
    user = _get_visible_user(username, request, db, "statistics")
    user_tz = _user_timezone(user)
    current_year = datetime.now(UTC).astimezone(user_tz).year
    selected_year = year or current_year
    if selected_year < 2000 or selected_year > current_year:
        raise HTTPException(422, "Недоступный год")

    local_start = datetime(selected_year, 1, 1, tzinfo=user_tz)
    local_end = datetime(selected_year + 1, 1, 1, tzinfo=user_tz)
    rows = db.query(
        Scrobble.played_at,
        Scrobble.listened_sec,
        Track.artist,
        Track.title,
        Track.cover_url,
    ).join(Track).filter(
        *_counted_filter(
            int(user.id), local_start.astimezone(UTC), local_end.astimezone(UTC))
    ).all()

    days: dict[str, dict[str, Any]] = {}
    artist_counts: dict[str, Counter] = {}
    track_counts: dict[str, Counter] = {}
    track_covers: dict[tuple[str, str], str | None] = {}
    for played_at, listened_sec, artist, title, cover_url in rows:
        if played_at.tzinfo is None:
            played_at = played_at.replace(tzinfo=UTC)
        key = played_at.astimezone(user_tz).date().isoformat()
        day = days.setdefault(key, {
            "date": key,
            "scrobbles": 0,
            "seconds": 0,
            "artists": set(),
        })
        day["scrobbles"] += 1
        day["seconds"] += int(listened_sec or 0)
        if artist:
            day["artists"].add(artist)
        artist_counts.setdefault(key, Counter())[artist or "Неизвестный артист"] += 1
        track_key = (artist or "Неизвестный артист", title or "Без названия")
        track_counts.setdefault(key, Counter())[track_key] += 1
        track_covers[track_key] = cover_url

    calendar_days = []
    for key in sorted(days):
        day = days[key]
        top_artist = artist_counts[key].most_common(1)[0][0]
        top_track = track_counts[key].most_common(1)[0][0]
        calendar_days.append({
            "date": key,
            "scrobbles": day["scrobbles"],
            "minutes": day["seconds"] // 60,
            "unique_artists": len(day["artists"]),
            "top_artist": top_artist,
            "top_track": {"artist": top_track[0],
                          "title": top_track[1],
                          "cover_url": track_covers.get(top_track)},
        })

    first_play, last_play = db.query(
        func.min(Scrobble.played_at), func.max(Scrobble.played_at)
    ).join(Track).filter(*_counted_filter(int(user.id))).one()
    available_years: list[int] = []
    if first_play and last_play:
        if first_play.tzinfo is None:
            first_play = first_play.replace(tzinfo=UTC)
        if last_play.tzinfo is None:
            last_play = last_play.replace(tzinfo=UTC)
        first_year = first_play.astimezone(user_tz).year
        last_year = last_play.astimezone(user_tz).year
        available_years = list(range(last_year, first_year - 1, -1))
    if current_year not in available_years:
        available_years.insert(0, current_year)

    best_day = max(
        calendar_days,
        key=lambda item: (item["scrobbles"], item["date"]),
        default=None,
    )
    return {
        "year": selected_year,
        "available_years": available_years,
        "days": calendar_days,
        "summary": {
            "active_days": len(calendar_days),
            "total_scrobbles": sum(day["scrobbles"] for day in calendar_days),
            "total_minutes": sum(day["seconds"] for day in days.values()) // 60,
            "longest_streak": _longest_day_streak(list(days)),
            "best_day": best_day,
        },
    }


# --- /api/current-track/{username} ---
@router.get("/api/current-track/{username}")
def get_current_track(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user or not _can_view_section(user, request, db, "current_track"):
        return {"playing": False}
    _, is_owner = _check_privacy_and_owner(user, request, db)
    if not is_owner and not preference_enabled(
            user.profile, "profile", "show_online_status"):
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
    is_active = s.is_playing and (datetime.now(UTC) - last_seen).total_seconds() < ACTIVE_PLAYBACK_WINDOW_SEC

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
def _visible_ranking(ranking, db, viewer_id=None):
    public_names = visible_statistics_users(db, viewer_id)
    return [{**item, "rank": rank} for rank, item in enumerate(
        (entry for entry in ranking if entry["username"] in public_names), 1)]


def _full_ranking(db: Session, viewer_id: int | None = None) -> list[dict[str, Any]]:
    """Every non-banned user with total XP, best first, with a global rank.
    Aggregates over all scrobbles: cached briefly (shared through Redis)."""
    cached = get_from_cache(LEADERBOARD_CACHE_KEY, ttl=LEADERBOARD_CACHE_TTL)
    if cached is not None:
        return _visible_ranking(cached, db, viewer_id)
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
            WHERE s.excluded_from_stats = false AND s.listened_sec * 100 >= COALESCE(NULLIF(t.duration, 0), 180) * 85
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
    return _visible_ranking(ranking, db, viewer_id)


def _period_ranking(db: Session, period: str, viewer_id: int | None = None) -> list[dict[str, Any]]:
    if period == "all":
        return _full_ranking(db, viewer_id)
    lifetime_levels = {
        entry["username"]: entry["level"] for entry in _full_ranking(db, viewer_id)
    }
    visible_ids = list(visible_statistics_users(db, viewer_id).values())
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
            User.id.in_(visible_ids),
            xp.c.total_xp.isnot(None),
        )
        .order_by(func.coalesce(xp.c.total_xp, 0).desc(), User.username)
        .all()
    )
    return [
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


@router.get("/api/leaderboard")
def get_leaderboard(
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
def get_public_stats(db: Annotated[Session, Depends(get_db)]):
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

    return {
        "total_users": total_users,
        "total_scrobbles": total_scrobbles,
        "total_tracks": total_tracks,
        "online": online_count}


def _completed_scrobble():
    """A scrobble counts once 85% of the track was heard (as in the XP rules)."""
    return Scrobble.listened_sec * 100 >= func.coalesce(
        func.nullif(Track.duration, 0), 180) * 85


@router.get("/api/public-stats/week")
def get_public_week(db: Annotated[Session, Depends(get_db)]):
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
