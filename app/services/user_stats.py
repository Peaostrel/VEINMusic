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


def get_user_level_info(user: User, db: Session):
    streak = get_active_streak(user)
    scrobbles_xp = db.query(
        func.sum(
            Scrobble.xp_earned)).join(Track).filter(
        Scrobble.user_id == user.id,
        Scrobble.listened_sec *
        100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).scalar() or 0
    base_xp = scrobbles_xp + (user.integration.bonus_xp or 0)
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
    return level, rank, total_xp, user.profile.theme
