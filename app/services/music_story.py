"""Small private narratives shared by recaps and the discovery page."""
from datetime import UTC, datetime, timedelta

from sqlalchemy import extract, func

from app.models import Scrobble, Track
from app.services.user_stats import get_user_timezone_offset


def weekly_story(user, db, now=None):
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
    text = f"За неделю — {plays} прослушиваний и {int(seconds) // 60} минут музыки."
    if top:
        text += f" Чаще всего звучал {top}."
    if new:
        text += f" Главное открытие — {new[0]}. Новых исполнителей: {len(new)}."
    if peak_hour is not None:
        text += f" Самый музыкальный час — {peak_hour:02d}:00."
    return {"from": start, "to": now, "plays": int(plays), "minutes": int(seconds) // 60,
            "top_artist": top, "new_artists": new[:12], "new_artists_count": len(new),
            "discovery": new[0] if new else None, "peak_hour": peak_hour, "story": text}
