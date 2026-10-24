import html
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.constants import ACTIVE_PLAYBACK_WINDOW_SEC
from app.core.i18n import normalize_lang, request_lang, tr, user_lang
from app.core.security import get_current_user
from app.database import get_db
from app.models import Scrobble, Track, User
from app.services.privacy import is_public_section
from app.services.user_preferences import preference_enabled

router = APIRouter(prefix="/api/widgets", tags=["widgets"])

SVG_MEDIA_TYPE = "image/svg+xml"
SVG_UTF8_MEDIA_TYPE = "image/svg+xml; charset=utf-8"
DEFAULT_ARTIST = "VEIN Music"
USERNAME_LIMIT = 32
NO_CACHE = {"Cache-Control": "no-cache"}
# Share cards are drawn in the language of whoever opens them
VARY_LANG = {"Vary": "Accept-Language, X-VEIN-Lang"}


# Texts of the embeddable widgets, shown on other sites. They have always been
# drawn in English for every owner; ?lang=ru draws them in Russian.
WIDGET_TEXTS = {
    "en": {"now": "LISTENING NOW ON VEIN", "last": "LAST PLAYED ON VEIN", "top": "TOP ARTISTS",
           "hidden": "Listening is hidden", "empty": "No scrobbles yet", "missing": "User not found",
           "private": "Private Profile", "track": "Unknown Track", "artist": "Unknown Artist"},
    "ru": {"now": "СЕЙЧАС ИГРАЕТ НА VEIN", "last": "НЕДАВНО НА VEIN", "top": "ТОП ИСПОЛНИТЕЛЕЙ",
           "hidden": "Прослушивания скрыты", "empty": "Пока нет прослушиваний", "missing": "Пользователь не найден",
           "private": "Приватный профиль", "track": "Без названия", "artist": "Неизвестный артист"},
}


def _widget_lang(lang: str | None, user=None) -> str:
    """?lang=ru|en, else the owner's language (English for unknown users)."""
    return normalize_lang(lang) or (user_lang(user) if user else "en")


def _card_lang(request: Request, lang: str | None) -> str:
    """Language of a share card: ?lang=ru|en, else the visitor's (Accept-Language)."""
    return normalize_lang(lang) or request_lang(request)


def _find_user(db: Session, username: str) -> User | None:
    """Widgets are embedded anywhere, so only what any visitor may see counts."""
    if len(username) > USERNAME_LIMIT:
        return None
    user = db.query(User).filter(User.username == username).first()
    if user is None or user.is_banned or user.profile is None:
        return None
    return user


def _shown_name(username: str) -> str:
    return username[:USERNAME_LIMIT]


def _listening(user_id):
    """Plays a widget may count: not deleted, not excluded from statistics."""
    return (Scrobble.user_id == user_id, Scrobble.deleted_at.is_(None),
            Scrobble.excluded_from_stats.is_(False))


def _is_active(scrobble: Scrobble) -> bool:
    last_seen = scrobble.updated_at or scrobble.played_at
    if last_seen is None:
        return False
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)
    return bool(scrobble.is_playing) and (
        datetime.now(UTC) - last_seen).total_seconds() < ACTIVE_PLAYBACK_WINDOW_SEC


def _escape(text: str | None) -> str:
    if not text:
        return ""
    return html.escape(str(text), quote=True)


def _truncate_escape(text: str | None, limit: int) -> str:
    """Truncate BEFORE escaping so an entity like &amp; is never cut in half
    (which would produce invalid XML and a broken SVG)."""
    raw = str(text or "")
    if len(raw) > limit:
        raw = raw[:limit] + "..."
    return _escape(raw)


def _render_now_playing_svg(username: str, title: str, artist: str, is_playing: bool,
                            lang: str = "en") -> str:
    escaped_user = _escape(username)
    escaped_title = _truncate_escape(title, 32)
    escaped_artist = _truncate_escape(artist, 36)

    status_text = WIDGET_TEXTS[lang]["now" if is_playing else "last"]
    badge_color = "#ef4444" if is_playing else "#71717a"
    pulse_dot = f'''
        <circle cx="28" cy="24" r="4" fill="{badge_color}">
            {"<animate attributeName='opacity' values='1;0.3;1' dur='1.5s' repeatCount='indefinite'/>" if is_playing else ""}
        </circle>
    '''

    equalizer = ""
    if is_playing:
        equalizer = '''
        <g transform="translate(370, 72)">
            <rect x="0" y="0" width="3" height="16" fill="#ef4444" rx="1.5">
                <animate attributeName="height" values="4;16;8;16;4" dur="0.8s" repeatCount="indefinite"/>
                <animate attributeName="y" values="12;0;8;0;12" dur="0.8s" repeatCount="indefinite"/>
            </rect>
            <rect x="6" y="0" width="3" height="16" fill="#ef4444" rx="1.5">
                <animate attributeName="height" values="16;6;14;4;16" dur="0.7s" repeatCount="indefinite"/>
                <animate attributeName="y" values="0;10;2;12;0" dur="0.7s" repeatCount="indefinite"/>
            </rect>
            <rect x="12" y="0" width="3" height="16" fill="#ef4444" rx="1.5">
                <animate attributeName="height" values="8;16;4;12;8" dur="0.9s" repeatCount="indefinite"/>
                <animate attributeName="y" values="8;0;12;4;8" dur="0.9s" repeatCount="indefinite"/>
            </rect>
            <rect x="18" y="0" width="3" height="16" fill="#ef4444" rx="1.5">
                <animate attributeName="height" values="12;4;16;8;12" dur="0.75s" repeatCount="indefinite"/>
                <animate attributeName="y" values="4;12;0;8;4" dur="0.75s" repeatCount="indefinite"/>
            </rect>
        </g>
        '''

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120" viewBox="0 0 420 120" fill="none">
    <defs>
        <linearGradient id="bg_grad" x1="0" y1="0" x2="420" y2="120" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#141416"/>
            <stop offset="100%" stop-color="#0a0a0c"/>
        </linearGradient>
        <linearGradient id="border_grad" x1="0" y1="0" x2="420" y2="120" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="rgba(255,255,255,0.15)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0.02)"/>
        </linearGradient>
    </defs>

    <rect width="420" height="120" rx="16" fill="url(#bg_grad)"/>
    <rect width="420" height="120" rx="16" stroke="url(#border_grad)" stroke-width="1.2"/>

    <!-- Status Header -->
    {pulse_dot}
    <text x="40" y="27" fill="#a1a1aa" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="700" letter-spacing="1.2">
        {status_text}
    </text>

    <text x="396" y="27" text-anchor="end" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="600">
        @{escaped_user}
    </text>

    <!-- Vinyl Disc Graphic -->
    <g transform="translate(24, 44)">
        <circle cx="28" cy="28" r="28" fill="#18181b" stroke="#27272a" stroke-width="1.5"/>
        <circle cx="28" cy="28" r="22" fill="none" stroke="#27272a" stroke-width="0.8" stroke-dasharray="3 3"/>
        <circle cx="28" cy="28" r="16" fill="none" stroke="#27272a" stroke-width="0.8"/>
        <circle cx="28" cy="28" r="9" fill="#ef4444" opacity="0.85"/>
        <circle cx="28" cy="28" r="3" fill="#09090b"/>
    </g>

    <!-- Track Info -->
    <g transform="translate(92, 60)">
        <text x="0" y="0" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700">
            {escaped_title}
        </text>
        <text x="0" y="20" fill="#a1a1aa" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500">
            {escaped_artist}
        </text>
    </g>

    <!-- Live Equalizer Bars -->
    {equalizer}
</svg>'''
    return svg


def _render_top_artists_svg(username: str, top_artists: list[tuple[str, int]], lang: str = "en") -> str:
    escaped_user = _escape(username)
    rows_svg = []
    max_count = max([c for _, c in top_artists], default=1) or 1

    for i, (artist, count) in enumerate(top_artists[:5]):
        y_pos = 50 + (i * 22)
        escaped_a = _truncate_escape(artist, 22)
        pct = max(10, int((count / max_count) * 180))

        row = f'''
        <g transform="translate(24, {y_pos})">
            <text x="0" y="10" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="700">{i+1}</text>
            <text x="16" y="10" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="600">{escaped_a}</text>
            <rect x="180" y="2" width="{pct}" height="8" rx="4" fill="#ef4444" opacity="0.85"/>
            <text x="372" y="10" text-anchor="end" fill="#a1a1aa" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="500">{count}</text>
        </g>
        '''
        rows_svg.append(row)

    height = 55 + max(1, len(top_artists)) * 24

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="420" height="{height}" viewBox="0 0 420 {height}" fill="none">
    <defs>
        <linearGradient id="top_bg" x1="0" y1="0" x2="420" y2="{height}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#141416"/>
            <stop offset="100%" stop-color="#0a0a0c"/>
        </linearGradient>
    </defs>
    <rect width="420" height="{height}" rx="16" fill="url(#top_bg)"/>
    <rect width="420" height="{height}" rx="16" stroke="rgba(255,255,255,0.08)" stroke-width="1.2"/>

    <text x="24" y="26" fill="#ef4444" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="800" letter-spacing="1.2">{WIDGET_TEXTS[lang]["top"]}</text>
    <text x="396" y="26" text-anchor="end" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="600">@{escaped_user}</text>

    {"".join(rows_svg)}
</svg>'''
    return svg


def _now_playing_text(db: Session, user: User, lang: str = "en") -> tuple[str, str, bool]:
    """Title, artist and "playing now" for the widget, by the profile's rules:
    the current track only when it and the online status are public, past
    plays only when the history is."""
    show_current = (is_public_section(user.profile, "current_track")
                    and preference_enabled(user.profile, "profile", "show_online_status"))
    show_history = is_public_section(user.profile, "history")
    recent = (
        db.query(Scrobble)
        .filter(Scrobble.user_id == user.id, Scrobble.deleted_at.is_(None))
        .order_by(Scrobble.played_at.desc(), Scrobble.id.desc())
        .limit(2)
        .all()
    )
    shown, is_playing = _visible_play(recent, show_current, show_history)
    if shown is None or not shown.track:
        hidden = recent and not show_history
        return WIDGET_TEXTS[lang]["hidden" if hidden else "empty"], DEFAULT_ARTIST, False
    return (shown.track.title or WIDGET_TEXTS[lang]["track"], shown.track.artist or WIDGET_TEXTS[lang]["artist"],
            is_playing)


def _visible_play(recent: list[Scrobble], show_current: bool,
                  show_history: bool) -> tuple[Scrobble | None, bool]:
    """The newest play the widget may show, and whether it is playing now."""
    if not recent:
        return None, False
    if _is_active(recent[0]):
        if show_current:
            return recent[0], True
        # A hidden track is playing: the one before it is the last played
        recent = recent[1:]
    return (recent[0] if recent and show_history else None), False


@router.get("/now-playing/{username}.svg")
def get_now_playing_widget(username: str, db: Annotated[Session, Depends(get_db)], lang: str | None = None):
    user = _find_user(db, username)
    lang = _widget_lang(lang, user)
    if not user:
        svg_content = _render_now_playing_svg(_shown_name(username), WIDGET_TEXTS[lang]["missing"], DEFAULT_ARTIST,
                                              False, lang)
        return Response(content=svg_content, media_type=SVG_MEDIA_TYPE, headers=NO_CACHE)

    if user.profile.is_private:
        svg_content = _render_now_playing_svg(username, WIDGET_TEXTS[lang]["private"], DEFAULT_ARTIST, False, lang)
        return Response(content=svg_content, media_type=SVG_MEDIA_TYPE, headers=NO_CACHE)

    title, artist, is_playing = _now_playing_text(db, user, lang)
    svg_content = _render_now_playing_svg(username, title, artist, is_playing, lang)
    return Response(
        content=svg_content,
        media_type=SVG_UTF8_MEDIA_TYPE,
        headers={
            "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
            "Content-Type": SVG_UTF8_MEDIA_TYPE,
        },
    )


@router.get("/top-artists/{username}.svg")
def get_top_artists_widget(username: str, db: Annotated[Session, Depends(get_db)], lang: str | None = None):
    user = _find_user(db, username)
    lang = _widget_lang(lang, user)
    if not user or not is_public_section(user.profile, "statistics"):
        svg_content = _render_top_artists_svg(_shown_name(username), [], lang)
        return Response(content=svg_content, media_type=SVG_MEDIA_TYPE, headers=NO_CACHE)

    top_artists = (
        db.query(Track.artist, func.count(Scrobble.id).label("count"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(*_listening(user.id), Track.artist.isnot(None))
        .group_by(Track.artist)
        .order_by(func.count(Scrobble.id).desc())
        .limit(5)
        .all()
    )

    artist_list = [(str(row.artist), int(row[1])) for row in top_artists]
    svg_content = _render_top_artists_svg(username, artist_list, lang)
    return Response(
        content=svg_content,
        media_type=SVG_UTF8_MEDIA_TYPE,
        headers={
            "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
            "Content-Type": SVG_UTF8_MEDIA_TYPE,
        },
    )


@router.get("/og/recap/{username}.svg")
def get_og_recap_card(request: Request, username: str, period: str = "week",
                      db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
                      lang: str | None = None):
    """Generate 1200x630 social share card for Weekly/Monthly recap."""
    from datetime import UTC, datetime, timedelta

    from app.services.og_image import generate_recap_card_svg

    lang = _card_lang(request, lang)
    user = _find_user(db, username)
    if not user:
        svg_content = generate_recap_card_svg(_shown_name(username), "User Not Found", 0, 0.0, [], lang=lang)
        return Response(content=svg_content, media_type=SVG_UTF8_MEDIA_TYPE, headers=VARY_LANG)

    if not is_public_section(user.profile, "statistics"):
        svg_content = generate_recap_card_svg(username, "Private Profile", 0, 0.0, [], lang=lang)
        return Response(content=svg_content, media_type=SVG_UTF8_MEDIA_TYPE, headers={**NO_CACHE, **VARY_LANG})

    now = datetime.now(UTC)
    delta_days = 30 if period == "month" else 7
    since_date = now - timedelta(days=delta_days)
    period_title = tr(lang, "ИТОГИ МЕСЯЦА" if period == "month" else "ИТОГИ НЕДЕЛИ")

    scrobbles_query = db.query(Scrobble).filter(
        *_listening(user.id),
        Scrobble.played_at >= since_date,
    )
    total_scrobbles = scrobbles_query.count()

    total_sec = (
        db.query(func.sum(Track.duration))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(*_listening(user.id), Scrobble.played_at >= since_date)
        .scalar()
        or 0
    )
    total_hours = float(total_sec) / 3600.0 if total_sec else (total_scrobbles * 3.2 / 60.0)

    top_artists = (
        db.query(Track.artist, func.count(Scrobble.id).label("count"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(*_listening(user.id), Scrobble.played_at >= since_date, Track.artist.isnot(None))
        .group_by(Track.artist)
        .order_by(func.count(Scrobble.id).desc())
        .limit(5)
        .all()
    )
    artist_list = [(str(row.artist), int(row[1])) for row in top_artists]

    top_genre_row = (
        db.query(Track.genre, func.count(Scrobble.id).label("count"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(*_listening(user.id), Scrobble.played_at >= since_date, Track.genre.isnot(None))
        .group_by(Track.genre)
        .order_by(func.count(Scrobble.id).desc())
        .first()
    )
    top_genre = "Various"
    if top_genre_row and top_genre_row[0]:
        top_genre = str(top_genre_row[0])
    elif user.profile and user.profile.favorite_genre:
        top_genre = user.profile.favorite_genre

    svg_content = generate_recap_card_svg(
        username=username,
        period_title=period_title,
        total_scrobbles=total_scrobbles,
        total_hours=total_hours,
        top_artists=artist_list,
        top_genre=top_genre or "Various",
        lang=lang,
    )
    return Response(
        content=svg_content,
        media_type=SVG_UTF8_MEDIA_TYPE,
        headers={"Cache-Control": "public, max-age=300, s-maxage=300", **VARY_LANG},
    )


@router.get("/og/achievement/{username}/{achievement_id}.svg")
def get_og_achievement_card(
    request: Request,
    username: str,
    achievement_id: int,
    db: Annotated[Session, Depends(get_db)],
    lang: str | None = None,
):
    """Generate 1200x630 social share card for an unlocked achievement."""
    from app.models import Achievement, UserAchievement
    from app.services.achievements import achievement_texts
    from app.services.og_image import generate_achievement_card_svg

    lang = _card_lang(request, lang)
    user = _find_user(db, username)
    ach = db.query(Achievement).filter(Achievement.id == achievement_id).first()
    # Only a public profile that really unlocked the achievement gets a
    # personalised card; otherwise anyone could forge "X unlocked Y" images.
    unlocked = bool(
        user and ach
        and not (user.profile and user.profile.is_private)
        and db.query(UserAchievement).filter(
            UserAchievement.user_id == user.id,
            UserAchievement.achievement_id == ach.id,
        ).first() is not None
    )

    if not unlocked or ach is None:
        svg_content = generate_achievement_card_svg(
            _shown_name(username), tr(lang, "Достижение"), "VEIN Music Gamification", "🏆", 0, lang=lang)
        return Response(content=svg_content, media_type=SVG_UTF8_MEDIA_TYPE, headers=VARY_LANG)

    texts = achievement_texts(ach, lang)
    svg_content = generate_achievement_card_svg(
        username=username,
        title=texts["name"],
        description=texts["description"],
        icon=str(ach.icon or "🏆"),
        reward_xp=int(ach.reward_xp or 50),
        lang=lang,
    )
    return Response(
        content=svg_content,
        media_type=SVG_UTF8_MEDIA_TYPE,
        headers={"Cache-Control": "public, max-age=600, s-maxage=600", **VARY_LANG},
    )


@router.get("/me/summary")
def get_my_widget_summary(current_user: Annotated[User, Depends(get_current_user)],
                          db: Annotated[Session, Depends(get_db)]):
    """What the iPhone widget (docs/iphone-widget.md) shows: the newest play
    and the last 7 days. Read with the owner's API key, so it works for
    private profiles too."""
    latest = (
        db.query(Scrobble)
        .filter(Scrobble.user_id == current_user.id, Scrobble.deleted_at.is_(None))
        .order_by(Scrobble.played_at.desc(), Scrobble.id.desc())
        .first()
    )
    now = None
    if latest is not None and latest.track is not None:
        now = {
            "title": latest.track.title,
            "artist": latest.track.artist,
            "cover_url": latest.track.cover_url,
            "is_playing": _is_active(latest),
            "played_at": latest.played_at.isoformat() if latest.played_at else None,
        }

    since = datetime.now(UTC) - timedelta(days=7)
    week = (*_listening(current_user.id), Scrobble.played_at >= since)
    plays, seconds = (
        db.query(func.count(Scrobble.id), func.coalesce(func.sum(Scrobble.listened_sec), 0))
        .filter(*week)
        .one()
    )

    def top(*columns):
        return (
            db.query(*columns, func.count(Scrobble.id))
            .join(Track, Scrobble.track_id == Track.id)
            .filter(*week, Track.artist.isnot(None))
            .group_by(*columns)
            .order_by(func.count(Scrobble.id).desc())
            .first()
        )

    artist = top(Track.artist)
    track = top(Track.title, Track.artist)
    return {
        "username": current_user.username,
        "now": now,
        "week": {
            "plays": int(plays or 0),
            "minutes": int(seconds or 0) // 60,
            "top_artist": artist[0] if artist else None,
            "top_track": {"title": track[0], "artist": track[1]} if track else None,
        },
    }
