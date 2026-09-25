"""Level, rank, streak and timezone helpers for users."""

import re
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Scrobble,
    Track,
    User,
)


def get_active_streak(user: User):
    if not user.integration.last_streak_date:
        return 0
    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    yesterday_str = (
        datetime.now(
            UTC) -
        timedelta(
            days=1)).strftime("%Y-%m-%d")
    if user.integration.last_streak_date in [today_str, yesterday_str]:
        return user.integration.current_streak or 0
    return 0


def get_user_timezone_offset(location: str) -> int:
    if not location:
        return 3
    loc = location.lower()
    mappings = {
        ("москва", "moscow", "санкт", "питер", "россия", "russia"): 3,
        ("калининград",): 2,
        ("самара",): 4,
        ("екатеринбург",): 5,
        ("омск",): 6,
        ("новосибирск", "красноярск"): 7,
        ("иркутск",): 8,
        ("якутск",): 9,
        ("владивосток",): 10,
        ("магадан",): 11,
        ("камчатка", "анадырь"): 12,
        ("лондон", "london", "uk"): 0,
        ("германия", "germany", "берлин", "paris", "франция"): 1
    }
    words = set(re.findall(r"\w+", loc))
    for keys, offset in mappings.items():
        # Short codes like "uk" must match a whole word, not any substring
        if any((k in words) if len(k) <= 3 else (k in loc) for k in keys):
            return offset
    return 3


def _counted_xp_query(db: Session):
    return db.query(Scrobble.user_id, func.coalesce(func.sum(Scrobble.xp_earned), 0)).join(Track).filter(
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85)


def _level_and_rank(user: User, scrobbles_xp: int) -> tuple[int, str, int]:
    streak = get_active_streak(user)
    base_xp = int(scrobbles_xp or 0) + (user.integration.bonus_xp or 0)
    total_xp = int(base_xp * 1.1) if streak >= 7 else base_xp
    level = (total_xp // 100) + 1
    if level >= 100:
        rank = "Божество"
    elif level >= 50:
        rank = "Легенда"
    elif level >= 30:
        rank = "Маньяк"
    elif level >= 15:
        rank = "Аудиофил"
    elif level >= 5:
        rank = "Меломан"
    else:
        rank = "Турист"
    return level, rank, total_xp


def get_user_level_info(user: User, db: Session):
    row = _counted_xp_query(db).filter(Scrobble.user_id == user.id).group_by(Scrobble.user_id).first()
    level, rank, total_xp = _level_and_rank(user, row[1] if row else 0)
    return level, rank, total_xp, user.profile.theme


def get_levels_for_users(users: list[User], db: Session) -> dict[int, int]:
    """Levels for many users with a single aggregate query (avoids N+1)."""
    ids = [int(u.id) for u in users]
    if not ids:
        return {}
    xp_by_user = dict(_counted_xp_query(db).filter(Scrobble.user_id.in_(ids)).group_by(Scrobble.user_id).all())
    return {int(u.id): _level_and_rank(u, xp_by_user.get(u.id, 0))[0] for u in users}
