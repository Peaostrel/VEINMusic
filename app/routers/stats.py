"""Listening statistics and the global feed (leaderboard: ``leaderboard``)."""

from collections import Counter
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)
from fastapi.encoders import jsonable_encoder
from sqlalchemy import case, func, text
from sqlalchemy.orm import Session, joinedload

from app.core.constants import ACTIVE_PLAYBACK_WINDOW_SEC, ORDER_PLAYS_DESC
from app.core.i18n import request_lang, tr
from app.core.rate_limit import HEAVY_READ_LIMIT, limiter
from app.database import get_db
from app.models import (
    Scrobble,
    Track,
    User,
    UserProfile,
)
from app.routers.common import (
    _can_view_section,
    _check_privacy_and_owner,
    _get_visible_user,
)
from app.services.cache import get_from_cache, set_to_cache
from app.services.localized import date_range, localize_history_items
from app.services.scrobble_processor import format_history_item
from app.services.privacy import filter_public_feed, public_feed_user_ids
from app.services.user_preferences import preference_enabled
from app.services.user_stats import (
    get_active_streak,
    get_user_level_info,
    get_user_timezone_offset,
)

router = APIRouter(tags=["stats"])

MAX_CUSTOM_PERIOD_DAYS = 366


def _user_timezone(user: User) -> timezone:
    location = user.profile.location if user.profile else ""
    return timezone(timedelta(hours=get_user_timezone_offset(location)))


class InvalidStatsPeriod(ValueError):
    """A user-selected listening period is invalid."""


def _period_bounds(
        user: User,
        period: str,
        date_from: str | None,
        date_to: str | None,
        lang: str = "ru") -> tuple[datetime | None, datetime | None, str]:
    """UTC bounds (end exclusive) and a human-readable period label (in
    `lang`; errors are raised with the Russian text, see tr)."""
    user_tz = _user_timezone(user)
    now_local = datetime.now(UTC).astimezone(user_tz)
    labels = {
        "7d": tr(lang, "За последние 7 дней"),
        "30d": tr(lang, "За последние 30 дней"),
        "90d": tr(lang, "За последние 3 месяца"),
        "year": tr(lang, "С начала {year} года", year=now_local.year),
        "all": tr(lang, "За всё время"),
        "custom": tr(lang, "Выбранный период"),
    }
    if period not in labels:
        raise InvalidStatsPeriod("Неизвестный период")
    if period == "all":
        return None, None, labels[period]

    if period == "custom":
        if not date_from or not date_to:
            raise InvalidStatsPeriod("Укажите начало и конец периода")
        try:
            first = date.fromisoformat(date_from)
            last = date.fromisoformat(date_to)
        except ValueError as exc:
            raise InvalidStatsPeriod("Дата должна быть в формате YYYY-MM-DD") from exc
        if first > last:
            raise InvalidStatsPeriod("Начало периода не может быть позже конца")
        if (last - first).days + 1 > MAX_CUSTOM_PERIOD_DAYS:
            raise InvalidStatsPeriod("Период не может быть длиннее 366 дней")
        start_local = datetime.combine(first, datetime.min.time(), tzinfo=user_tz)
        end_local = datetime.combine(last + timedelta(days=1), datetime.min.time(), tzinfo=user_tz)
        label = date_range(first, last, lang)
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
            responses={404: {"description": "User not found"},
                       422: {"description": "Invalid period or custom date range"}})
@limiter.limit(HEAVY_READ_LIMIT)
def get_wrapped_stats(
        username: str,
        request: Request,
        db: Annotated[Session, Depends(get_db)],
        period: str = "30d",
        date_from: str | None = None,
        date_to: str | None = None):
    user = _get_visible_user(username, request, db, "statistics")
    lang = request_lang(request)
    try:
        period_start, period_end, period_label = _period_bounds(
            user, period, date_from, date_to, lang)
    except InvalidStatsPeriod as exc:
        raise HTTPException(422, tr(lang, str(exc))) from exc
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
            user.profile.location if user.profile else ""), lang)
    del hours_activity, days_activity
    peak_day = None
    if activity_graph:
        peak_date, peak_count = max(
            activity_graph.items(), key=lambda item: (item[1], item[0]))
        peak_day = {"date": peak_date, "scrobbles": peak_count}
    return {
        "period": period_label,
        "top_artist": top_artist[0] if top_artist else tr(lang, "Нет данных"),
        "total_minutes": int(total_min // 60),
        # total_min holds seconds: the badge is for 5000+ minutes
        "status": tr(lang, "Легенда" if total_min // 60 > 5000 else "Активный слушатель"),
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
GLOBAL_FEED_CACHE_KEY = "global_feed"
# The same for every visitor (home page and feed): built at most every few
# seconds. Privacy and bans are rechecked on every read by filter_public_feed.
GLOBAL_FEED_TTL = 5


@router.get("/api/feed/global")
def get_global_feed(request: Request, db: Annotated[Session, Depends(get_db)]):
    cached = get_from_cache(GLOBAL_FEED_CACHE_KEY, ttl=GLOBAL_FEED_TTL)
    if cached is None:
        # Latest scrobbles from public users; tracks in the same query
        scrobbles = db.query(Scrobble).options(joinedload(Scrobble.track)).join(User).join(
            UserProfile).filter(
            UserProfile.is_private.is_(False), User.is_banned.isnot(True),
            User.id.in_(public_feed_user_ids(db))).order_by(
            Scrobble.played_at.desc(), Scrobble.id.desc()).limit(100).all()
        cached = jsonable_encoder([format_history_item(s, s.track) for s in scrobbles])
        set_to_cache(GLOBAL_FEED_CACHE_KEY, cached, expire=60)
    return {"feed": localize_history_items(filter_public_feed(cached, db)[:20], request_lang(request))}


def _get_activity_stats(
        db: Session,
        base_filter,
        timezone_offset: int = 0,
        lang: str = "ru") -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
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
    if lang != "ru":
        # Weekday keys in the visitor's language ("Mon"), same order
        days_activity = {tr(lang, day): count for day, count in days_activity.items()}

    activity_graph = {
        date: count for date,
        count in graph_raw if date is not None}
    return hours_activity, days_activity, activity_graph


# --- /api/detailed-stats/{username} ---
@router.get("/api/detailed-stats/{username}",
            responses={404: {"description": "User not found"},
                       422: {"description": "Invalid period or custom date range"}})
@limiter.limit(HEAVY_READ_LIMIT)
def get_detailed_stats(username: str,
                       request: Request,
                       db: Annotated[Session,
                                     Depends(get_db)],
                       period: str = "all",
                       date_from: str | None = None,
                       date_to: str | None = None):
    user = _get_visible_user(username, request, db, "statistics")
    lang = request_lang(request)
    try:
        period_start, period_end, period_label = _period_bounds(
            user, period, date_from, date_to, lang)
    except InvalidStatsPeriod as exc:
        raise HTTPException(422, tr(lang, str(exc))) from exc
    # ~17 queries: reused until the user's listening changes (or briefly,
    # for catalog edits and the moving edge of relative periods)
    location = user.profile.location if user.profile else ""
    key = (f"detailed_stats:{user.id}:{period}:{date_from}:{date_to}:"
           f"{location}:{lang}:{_listening_version(db, int(user.id))}")
    cached = get_from_cache(key, ttl=DETAILED_STATS_TTL)
    if cached is not None:
        return cached
    result = jsonable_encoder(_detailed_stats(
        db, user, period, period_start, period_end, period_label, lang))
    set_to_cache(key, result, expire=DETAILED_STATS_TTL)
    return result


DETAILED_STATS_TTL = 120


def _listening_version(db: Session, user_id: int) -> str:
    """Changes with any new, advanced, counted, excluded, restored, deleted
    or re-linked scrobble of the user (one indexed aggregate)."""
    row = db.query(
        func.count(Scrobble.id), func.max(Scrobble.id), func.max(Scrobble.updated_at),
        func.coalesce(func.sum(Scrobble.listened_sec), 0), func.coalesce(func.sum(Scrobble.track_id), 0),
    ).filter(Scrobble.user_id == user_id).one()
    return ":".join(str(value) for value in row)


# Sources the stats page can link an artist, track or album to (links.ts)
_LINKABLE_SOURCES = ("yandex", "spotify", "vk", "youtube_music", "soundcloud", "apple_music", "zvuk")


def _link_source():
    """Source of a top row: one with a link when any of its plays has one.

    A row joins plays from several sources (live, Last.fm, transfers), and a
    plain max() could pick one without a link, such as "transfer"."""
    return func.coalesce(
        func.max(case((Scrobble.source.in_(_LINKABLE_SOURCES), Scrobble.source))),
        func.max(Scrobble.source))


def _detailed_stats(db: Session, user: User, period: str, period_start, period_end, period_label,
                    lang: str = "ru"):
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
        _link_source().label('source'),
        func.max(Track.cover_url).label('cover_url')) .join(Scrobble).filter(
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
        _link_source().label('source')) .join(Scrobble).filter(
                *
                base_filter).group_by(
                    Track.id,
                    Track.title,
                    Track.artist,
                    Track.cover_url,
                    Track.track_url) .order_by(
                        text(ORDER_PLAYS_DESC)).limit(10).all()

    # 4. Top Albums
    # One row per album: its tracks may carry different covers (Last.fm and
    # the player give their own) and letter case of the name
    top_albums_raw = db.query(
        func.max(Track.album).label('album'),
        Track.artist,
        func.max(func.nullif(Track.cover_url, '')).label('cover_url'),
        func.count(
            Scrobble.id).label('plays'),
        _link_source().label('source')) .join(Scrobble).filter(
                *
                base_filter,
                Track.album.isnot(None), Track.album != "") .group_by(
                    func.lower(Track.album),
                    Track.artist) .order_by(
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
            user.profile.location if user.profile else ""), lang)

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
                             "source": r[2],
                             "cover_url": r[3]} for r in top_artists_raw],
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
@limiter.limit(HEAVY_READ_LIMIT)
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
@limiter.limit(HEAVY_READ_LIMIT)
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


def _aggregate_calendar_days(rows, user_tz, lang: str = "ru"):
    unknown_artist, untitled = tr(lang, "Неизвестный артист"), tr(lang, "Без названия")
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
        artist_counts.setdefault(key, Counter())[artist or unknown_artist] += 1
        track_key = (artist or unknown_artist, title or untitled)
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

    return days, calendar_days


@router.get("/api/stats/calendar/{username}",
            responses={404: {"description": "User not found"},
                       422: {"description": "Calendar year is outside the supported range"}})
@limiter.limit(HEAVY_READ_LIMIT)
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
        raise HTTPException(422, tr(request_lang(request), "Недоступный год"))

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

    days, calendar_days = _aggregate_calendar_days(rows, user_tz, request_lang(request))

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


def _playback_details(user, scrobble, track, is_owner):
    show_source = is_owner or preference_enabled(user.profile, "privacy", "show_listening_source")
    details = {"source": scrobble.source if show_source else "",
               "duration": None, "listened_sec": None, "excluded": None,
               "display_listened_sec": None, "display_position_sec": None,
               "playback_remaining_sec": None}
    if is_owner:
        last_seen = scrobble.updated_at or scrobble.played_at
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=UTC)
        elapsed = max(0, (datetime.now(UTC) - last_seen).total_seconds())
        duration = int(track.duration or 180)
        # This estimate is presentation-only; credit remains server-confirmed.
        advance = elapsed if scrobble.is_playing else 0
        shown = int(scrobble.listened_sec or 0) + int(scrobble.pending_sec or 0) + advance
        position = scrobble.position_sec
        details.update(duration=int(track.duration or 180), listened_sec=int(scrobble.listened_sec or 0),
                       excluded=bool(scrobble.excluded_from_stats),
                       display_listened_sec=min(duration, max(0, shown)),
                       display_position_sec=min(duration, max(0, position + advance)) if position is not None else None,
                       playback_remaining_sec=max(0, ACTIVE_PLAYBACK_WINDOW_SEC - elapsed))
    return details


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
        Scrobble.user_id == user.id, Scrobble.is_imported.isnot(True)).order_by(
            Scrobble.id.desc()).first()

    if not last_scrobble:
        return {"playing": False}

    s, t = last_scrobble
    last_seen = s.updated_at or s.played_at
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)
    is_active = s.is_playing and (datetime.now(UTC) - last_seen).total_seconds() < ACTIVE_PLAYBACK_WINDOW_SEC

    # Keep the owner's explicit player pause visible, including short plays.
    # An absent heartbeat is not a pause and must still expire normally.
    is_paused = is_owner and not s.is_playing and s.position_sec is not None
    if is_active or is_paused:
        lvl, rank, _, _ = get_user_level_info(user, db)
        return {
            "playing": bool(is_active),
            **({"paused": True} if is_paused else {}),
            "title": t.title,
            "artist": t.artist,
            "cover_url": t.cover_url,
            "level": lvl,
            "rank": tr(request_lang(request), rank),
            **_playback_details(user, s, t, is_owner),
        }
    return {"playing": False}
