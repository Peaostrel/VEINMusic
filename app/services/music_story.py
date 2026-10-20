"""Small private narratives shared by recaps and the discovery page."""
from datetime import UTC, datetime, timedelta

from sqlalchemy import extract, func

from app.core.i18n import plural, tr
from app.models import Scrobble, Track
from app.services.user_stats import get_user_timezone_offset


def story_text(lang, plays, minutes, top=None, discovery=None, new_count=0, peak_hour=None):
    """The weekly narrative in `lang` (the reader's language)."""
    parts = [tr(lang, "За неделю — {plays} прослушиваний и {minutes} минут музыки.", plays=plays, minutes=minutes,
                plays_word=plural(lang, plays, "прослушивание", "прослушивания", "прослушиваний"),
                minutes_word=plural(lang, minutes, "минута", "минуты", "минут"))]
    if top:
        parts.append(tr(lang, "Чаще всего звучал {artist}.", artist=top))
    if discovery:
        parts.append(tr(lang, "Главное открытие — {artist}. Новых исполнителей: {n}.", artist=discovery, n=new_count))
    if peak_hour is not None:
        parts.append(tr(lang, "Самый музыкальный час — {hour}:00.", hour=f"{peak_hour:02d}"))
    return " ".join(parts)


def weekly_story(user, db, now=None, lang="ru"):
    now = now or datetime.now(UTC)
    start = now - timedelta(days=7)
    query = db.query(Track.artist, func.count(Scrobble.id)).join(Scrobble, Scrobble.track_id == Track.id).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85)
    artists = {name: int(count) for name, count in query.filter(Scrobble.played_at >= start, Scrobble.played_at <= now).group_by(Track.artist).all() if name}
    before = {name for name, in db.query(Track.artist).join(Scrobble, Scrobble.track_id == Track.id).filter(Scrobble.user_id == user.id, Scrobble.played_at < start, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).distinct() if name}
    new = sorted(artists.keys() - before, key=lambda name: (-artists[name], name))
    plays, seconds = db.query(func.count(Scrobble.id), func.coalesce(func.sum(Scrobble.listened_sec), 0)).join(Track, Track.id == Scrobble.track_id).filter(
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
        Scrobble.user_id == user.id, Scrobble.played_at >= start, Scrobble.played_at <= now).one()
    top = max(artists, key=artists.get) if artists else None
    offset = get_user_timezone_offset(user.profile.location if user.profile else "")
    hours = db.query(extract("hour", Scrobble.played_at), func.count(Scrobble.id)).join(Track, Track.id == Scrobble.track_id).filter(
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
        Scrobble.user_id == user.id, Scrobble.played_at >= start, Scrobble.played_at <= now).group_by(extract("hour", Scrobble.played_at)).all()
    peak_hour = (int(max(hours, key=lambda row: row[1])[0]) + offset) % 24 if hours else None
    text = story_text(lang, int(plays), int(seconds) // 60, top, new[0] if new else None, len(new), peak_hour)
    return {"from": start, "to": now, "plays": int(plays), "minutes": int(seconds) // 60,
            "top_artist": top, "new_artists": new[:12], "new_artists_count": len(new),
            "discovery": new[0] if new else None, "peak_hour": peak_hour, "story": text}
