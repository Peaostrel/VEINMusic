import html
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Scrobble, Track, User

router = APIRouter(prefix="/api/widgets", tags=["widgets"])

SVG_MEDIA_TYPE = "image/svg+xml"
SVG_UTF8_MEDIA_TYPE = "image/svg+xml; charset=utf-8"
DEFAULT_ARTIST = "VEIN Music"


def _escape(text: str | None) -> str:
    if not text:
        return ""
    return html.escape(str(text), quote=True)


def _render_now_playing_svg(username: str, title: str, artist: str, is_playing: bool) -> str:
    escaped_user = _escape(username)
    escaped_title = _escape(title)
    escaped_artist = _escape(artist)

    status_text = "LISTENING NOW ON VEIN" if is_playing else "LAST PLAYED ON VEIN"
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
            {escaped_title[:32] + ('...' if len(escaped_title) > 32 else '')}
        </text>
        <text x="0" y="20" fill="#a1a1aa" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500">
            {escaped_artist[:36] + ('...' if len(escaped_artist) > 36 else '')}
        </text>
    </g>

    <!-- Live Equalizer Bars -->
    {equalizer}
</svg>'''
    return svg


def _render_top_artists_svg(username: str, top_artists: list[tuple[str, int]]) -> str:
    escaped_user = _escape(username)
    rows_svg = []
    max_count = max([c for _, c in top_artists], default=1) or 1

    for i, (artist, count) in enumerate(top_artists[:5]):
        y_pos = 50 + (i * 22)
        escaped_a = _escape(artist)
        pct = max(10, int((count / max_count) * 180))

        row = f'''
        <g transform="translate(24, {y_pos})">
            <text x="0" y="10" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="700">{i+1}</text>
            <text x="16" y="10" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="600">{escaped_a[:22] + ('...' if len(escaped_a) > 22 else '')}</text>
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

    <text x="24" y="26" fill="#ef4444" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="800" letter-spacing="1.2">TOP ARTISTS</text>
    <text x="396" y="26" text-anchor="end" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="600">@{escaped_user}</text>

    {"".join(rows_svg)}
</svg>'''
    return svg


@router.get("/now-playing/{username}.svg")
def get_now_playing_widget(username: str, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        svg_content = _render_now_playing_svg(username, "User not found", DEFAULT_ARTIST, False)
        return Response(content=svg_content, media_type=SVG_MEDIA_TYPE, headers={"Cache-Control": "no-cache"})

    if user.profile and user.profile.is_private:
        svg_content = _render_now_playing_svg(username, "Private Profile", DEFAULT_ARTIST, False)
        return Response(content=svg_content, media_type=SVG_MEDIA_TYPE, headers={"Cache-Control": "no-cache"})

    # Check currently playing or most recent scrobble
    last_scrobble = (
        db.query(Scrobble)
        .filter(Scrobble.user_id == user.id)
        .order_by(Scrobble.id.desc())
        .first()
    )

    if last_scrobble and last_scrobble.track:
        title = last_scrobble.track.title or "Unknown Track"
        artist = last_scrobble.track.artist or "Unknown Artist"
        is_playing = bool(last_scrobble.is_playing)
    else:
        title = "No scrobbles yet"
        artist = DEFAULT_ARTIST
        is_playing = False

    svg_content = _render_now_playing_svg(username, title, artist, is_playing)
    return Response(
        content=svg_content,
        media_type=SVG_UTF8_MEDIA_TYPE,
        headers={
            "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
            "Content-Type": SVG_UTF8_MEDIA_TYPE,
        },
    )


@router.get("/top-artists/{username}.svg")
def get_top_artists_widget(username: str, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        svg_content = _render_top_artists_svg(username, [])
        return Response(content=svg_content, media_type=SVG_MEDIA_TYPE, headers={"Cache-Control": "no-cache"})

    if user.profile and user.profile.is_private:
        svg_content = _render_top_artists_svg(username, [])
        return Response(content=svg_content, media_type=SVG_MEDIA_TYPE, headers={"Cache-Control": "no-cache"})

    top_artists = (
        db.query(Track.artist, func.count(Scrobble.id).label("count"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == user.id, Track.artist.isnot(None))
        .group_by(Track.artist)
        .order_by(func.count(Scrobble.id).desc())
        .limit(5)
        .all()
    )

    artist_list = [(str(row.artist), int(row[1])) for row in top_artists]
    svg_content = _render_top_artists_svg(username, artist_list)
    return Response(
        content=svg_content,
        media_type=SVG_UTF8_MEDIA_TYPE,
        headers={
            "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
            "Content-Type": SVG_UTF8_MEDIA_TYPE,
        },
    )


@router.get("/og/recap/{username}.svg")
def get_og_recap_card(username: str, period: str = "week", db: Annotated[Session, Depends(get_db)] = None):  # type: ignore[assignment]
    """Generate 1200x630 social share card for Weekly/Monthly recap."""
    from datetime import UTC, datetime, timedelta
    from app.services.og_image import generate_recap_card_svg

    user = db.query(User).filter(User.username == username).first()
    if not user:
        svg_content = generate_recap_card_svg(username, "User Not Found", 0, 0.0, [])
        return Response(content=svg_content, media_type=SVG_UTF8_MEDIA_TYPE)

    now = datetime.now(UTC)
    delta_days = 30 if period == "month" else 7
    since_date = now - timedelta(days=delta_days)
    period_title = "ИТОГИ МЕСЯЦА" if period == "month" else "ИТОГИ НЕДЕЛИ"

    scrobbles_query = db.query(Scrobble).filter(
        Scrobble.user_id == user.id,
        Scrobble.played_at >= since_date,
    )
    total_scrobbles = scrobbles_query.count()

    total_sec = (
        db.query(func.sum(Track.duration))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == user.id, Scrobble.played_at >= since_date)
        .scalar()
        or 0
    )
    total_hours = float(total_sec) / 3600.0 if total_sec else (total_scrobbles * 3.2 / 60.0)

    top_artists = (
        db.query(Track.artist, func.count(Scrobble.id).label("count"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == user.id, Scrobble.played_at >= since_date, Track.artist.isnot(None))
        .group_by(Track.artist)
        .order_by(func.count(Scrobble.id).desc())
        .limit(5)
        .all()
    )
    artist_list = [(str(row.artist), int(row[1])) for row in top_artists]

    top_genre_row = (
        db.query(Track.genre, func.count(Scrobble.id).label("count"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == user.id, Scrobble.played_at >= since_date, Track.genre.isnot(None))
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
    )
    return Response(
        content=svg_content,
        media_type=SVG_UTF8_MEDIA_TYPE,
        headers={"Cache-Control": "public, max-age=300, s-maxage=300"},
    )


@router.get("/og/achievement/{username}/{achievement_id}.svg")
def get_og_achievement_card(
    username: str,
    achievement_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    """Generate 1200x630 social share card for an unlocked achievement."""
    from app.models import Achievement
    from app.services.og_image import generate_achievement_card_svg

    user = db.query(User).filter(User.username == username).first()
    ach = db.query(Achievement).filter(Achievement.id == achievement_id).first()

    if not user or not ach:
        svg_content = generate_achievement_card_svg(username, "Достижение", "VEIN Music Gamification", "🏆", 0)
        return Response(content=svg_content, media_type=SVG_UTF8_MEDIA_TYPE)

    svg_content = generate_achievement_card_svg(
        username=username,
        title=str(ach.name),
        description=str(ach.description),
        icon=str(ach.icon or "🏆"),
        reward_xp=int(ach.reward_xp or 50),
    )
    return Response(
        content=svg_content,
        media_type=SVG_UTF8_MEDIA_TYPE,
        headers={"Cache-Control": "public, max-age=600, s-maxage=600"},
    )
