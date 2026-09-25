"""Achievement rules: auto-award checks and progress calculation."""

import logging
import re
import urllib.parse
from datetime import UTC, timedelta

import httpx
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.constants import (
    ALBUM_PATH,
    SCDN_CO,
    TRACK_PATH,
    USER_AGENT_MOZILLA,
    YANDEX_AVATARS,
    YANDEX_MUSIC_DOMAIN,
)
from app.database import SessionLocal
from app.models import (
    Achievement,
    Scrobble,
    Track,
    User,
    UserAchievement,
)
from app.services.og_parser import parse_og_meta
from app.services.user_stats import get_user_timezone_offset

logger = logging.getLogger(__name__)


def _check_total_scrobbles(user, ach, db: Session) -> bool:
    return db.query(Scrobble).join(Track).filter(
        Scrobble.user_id == user.id,
        Scrobble.listened_sec *
        100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).count() >= ach.rule_value


def _check_night_scrobbles(user, ach, db: Session) -> bool:
    valid_times = db.query(
        Scrobble.played_at).join(Track).filter(
        Scrobble.user_id == user.id,
        Scrobble.listened_sec *
        100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).all()
    offset = get_user_timezone_offset(
        str(user.profile.location) if (user.profile and user.profile.location) else "")
    night_count = sum(
        1 for (
            dt,
        ) in valid_times if (
            dt +
            timedelta(
                hours=offset)).strftime('%H') in [
                    '00',
                    '01',
                    '02',
                    '03',
                    '04',
            '05'])
    return night_count >= ach.rule_value


def _scrobble_count_for_parts(db, user_id, parts):
    if len(parts) >= 2:
        return db.query(Scrobble).join(Track).filter(
            Scrobble.user_id == user_id,
            Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
            (Track.artist.ilike(f"%{parts[0]}%") & Track.title.ilike(f"%{parts[-1]}%"))
            | (Track.title.ilike(f"%{parts[0]}%") & Track.title.ilike(f"%{parts[-1]}%"))
        ).count()
    return db.query(Scrobble).join(Track).filter(
        Scrobble.user_id == user_id,
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
        (Track.title.ilike(f"%{parts[0]}%")) | (
            Track.artist.ilike(f"%{parts[0]}%"))).count()


def _count_by_url(db, user_id, target_str):
    if "yandex.ru" in target_str and TRACK_PATH in target_str:
        track_id = target_str.split(TRACK_PATH)[1].strip("/")
        return db.query(Scrobble).join(Track).filter(
            Scrobble.user_id == user_id,
            Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
            Track.track_url.like(f"%/track/{track_id}%")
        ).count()
    return db.query(Scrobble).join(Track).filter(
        Scrobble.user_id == user_id,
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
        Track.track_url.like(f"%{target_str}%")
    ).count()


def _check_specific_track(user, ach, db: Session) -> bool:
    if not ach.rule_target:
        return False
    if ach.rule_target.startswith("http"):
        if hasattr(ach, 'rule_meta') and ach.rule_meta:
            parts = [
                p.strip() for p in ach.rule_meta.replace(
                    '—', '-').split('-')]
            count = _scrobble_count_for_parts(db, user.id, parts)
        else:
            count = _count_by_url(db, user.id, ach.rule_target.split('?')[0])
    else:
        parts = [p.strip()
                 for p in ach.rule_target.replace('—', '-').split('-')]
        target0 = ach.rule_target.split(
            "||")[0] if "||" in ach.rule_target else ach.rule_target
        if len(parts) >= 2:
            count = _scrobble_count_for_parts(db, user.id, parts)
        else:
            count = db.query(Scrobble).join(Track).filter(
                Scrobble.user_id == user.id,
                Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
                (Track.title.ilike(f"%{ach.rule_target}%")) | (
                    Track.artist.ilike(f'%{target0}%'))).count()
    return count >= ach.rule_value


def _check_specific_album(user, ach, db: Session) -> bool:
    if not ach.rule_target:
        return False
    if ach.target_image and (
            YANDEX_AVATARS in ach.target_image or SCDN_CO in ach.target_image):
        count = db.query(
            func.count(
                func.distinct(
                    Scrobble.track_id))).join(Track).filter(
            Scrobble.user_id == user.id,
            Scrobble.listened_sec *
            100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
            Track.cover_url == ach.target_image).scalar() or 0
    else:
        clean_target = ach.rule_target.split('?')[0]
        count = db.query(
            func.count(
                func.distinct(
                    Scrobble.track_id))).join(Track).filter(
            Scrobble.user_id == user.id,
            Scrobble.listened_sec *
            100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
            Track.track_url.like(f"%{clean_target}%")).scalar() or 0
    return count >= ach.rule_value


def _check_specific_artist(user, ach, db: Session) -> bool:
    if not ach.rule_target:
        return False
    target = ach.rule_target.split(
        "||")[0] if "||" in ach.rule_target else ach.rule_target
    count = db.query(Scrobble).join(Track).filter(
        Scrobble.user_id == user.id,
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
        Track.artist.ilike(f'%{target}%')).count()
    return count >= ach.rule_value


def check_auto_achievements(user, db: Session):
    auto_achs = db.query(Achievement).filter(
        Achievement.rule_type != "manual").all()
    if not auto_achs:
        return
    user_ach_ids = {ua.achievement_id for ua in db.query(
        UserAchievement).filter_by(user_id=user.id).all()}

    checkers = {
        "total_scrobbles": _check_total_scrobbles,
        "night_scrobbles": _check_night_scrobbles,
        "specific_track": _check_specific_track,
        "specific_album": _check_specific_album,
        "specific_artist": _check_specific_artist
    }

    for ach in auto_achs:
        if ach.id in user_ach_ids:
            continue
        checker = checkers.get(str(ach.rule_type))
        if checker and checker(user, ach, db):
            db.add(UserAchievement(user_id=user.id, achievement_id=ach.id))
            user.integration.bonus_xp = (
                user.integration.bonus_xp or 0) + (ach.reward_xp or 0)
            try:
                db.commit()
            except IntegrityError:
                # Already awarded by a concurrent check (unique constraint):
                # roll back so the reward XP is not granted twice.
                db.rollback()


def run_check_achievements_bg(user_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            check_auto_achievements(user, db)
    finally:
        db.close()


def _calc_specific_track(db: Session, user: User, a: Achievement) -> int:
    if a.rule_target.startswith("http"):
        if hasattr(a, 'rule_meta') and a.rule_meta:
            parts = [p.strip() for p in a.rule_meta.replace('—', '-').split('-')]
            if len(parts) < 2:
                parts = a.rule_meta.split()
            if len(parts) >= 2:
                from sqlalchemy import and_, or_
                word_filters = [or_(Track.title.ilike(f"%{w.strip()}%"), Track.artist.ilike(
                    f"%{w.strip()}%")) for w in parts if w.strip()]
                return db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, and_(*word_filters)).count()
            return db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, (Track.title.ilike(f"%{a.rule_meta}%")) | (Track.artist.ilike(f"%{a.rule_meta}%"))).count()
        target_str = a.rule_target.split('?')[0]
        if "yandex.ru" in target_str and TRACK_PATH in target_str:
            track_id = target_str.split(TRACK_PATH)[1].strip("/")
            return db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, Track.track_url.like(f"%/track/{track_id}%")).count()
        return db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, Track.track_url.like(f"%/track/{target_str}%")).count()
    parts = [p.strip() for p in a.rule_target.replace('—', '-').split('-')]
    if len(parts) >= 2:
        return db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, (Track.artist.ilike(f"%{parts[0].strip()}%") & Track.title.ilike(f"%{parts[-1].strip()}%")) | (Track.title.ilike(f"%{parts[0].strip()}%") & Track.title.ilike(f"%{parts[-1].strip()}%"))).count()
    return db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, (Track.title.ilike(f"%{a.rule_target}%")) | (Track.artist.ilike(f'%{a.rule_target.split("||")[0] if "||" in a.rule_target else a.rule_target}%'))).count()


def _calc_specific_album(db: Session, user: User, a: Achievement) -> int:
    current_val_img = 0
    if a.target_image:
        current_val_img = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(
            Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, Track.cover_url == a.target_image).scalar() or 0
    current_val_text = 0
    album_name = a.rule_meta if a.rule_meta else a.rule_target
    if "||" in a.rule_target:
        album_name = a.rule_target.split("||")[0]
    if album_name and not album_name.startswith("http"):
        parts = [p.strip() for p in album_name.replace('—', '-').split('-')]
        if len(parts) >= 2:
            current_val_text = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec *
                                                                                                         100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, Track.artist.ilike(f"%{parts[0].strip()}%"), Track.album.ilike(f"%{parts[-1].strip()}%")).scalar() or 0
        else:
            current_val_text = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(
                Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, Track.album.ilike(f"%{album_name.strip()}%")).scalar() or 0
    return max(current_val_img, current_val_text)


def _calculate_achievement_progress(db: Session, user: User, a: Achievement) -> int:
    if a.rule_type == "total_scrobbles":
        return db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).count()
    elif a.rule_type == "night_scrobbles":
        valid_times = db.query(Scrobble.played_at).join(Track).filter(
            Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).all()
        return sum(1 for (dt,) in valid_times if dt.replace(tzinfo=UTC).astimezone().strftime('%H') in ['00', '01', '02', '03', '04', '05'])
    elif a.rule_type == "specific_track" and a.rule_target:
        return _calc_specific_track(db, user, a)
    elif a.rule_type == "specific_album" and a.rule_target:
        return _calc_specific_album(db, user, a)
    elif a.rule_type == "specific_artist" and a.rule_target:
        return db.query(Scrobble).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, Track.artist.ilike(f'%{a.rule_target.split("||")[0] if "||" in a.rule_target else a.rule_target}%')).count()
    return 0


def _format_achievement_data(db: Session, user: User, a: Achievement, ua: UserAchievement | None, total_users: int) -> dict:
    earned_count = db.query(UserAchievement).filter_by(achievement_id=a.id).count()
    rarity = round((earned_count / total_users * 100), 1) if total_users > 0 else 0
    current_val = 0
    target_val = a.rule_value

    if not ua and a.rule_type != "manual":
        current_val = _calculate_achievement_progress(db, user, a)
    if ua:
        current_val = int(target_val) if target_val else 0

    return {
        "id": a.id,
        "name": a.name,
        "description": a.description,
        "icon": a.icon,
        "target_image": a.target_image,
        "reward_xp": a.reward_xp,
        "is_earned": bool(ua),
        "earned_at": ua.earned_at if ua else None,
        "is_displayed": ua.is_displayed if ua else False,
        "rarity": rarity,
        "current_progress": current_val,
        "target_value": target_val,
        "rule_type": a.rule_type,
        "rule_target": a.rule_target,
        "rule_meta": a.rule_meta
    }


async def _enrich_achievement_data(rule_type: str, target_val: str, val: int, t_img: str, meta_text: str):
    is_valid_type = rule_type in ["specific_track", "specific_album", "specific_artist"]
    is_http_target = target_val and target_val.startswith("http")

    if not is_valid_type or not is_http_target:
        return target_val, val, t_img, meta_text

    is_internal_image = YANDEX_AVATARS in target_val or SCDN_CO in target_val
    if is_internal_image:
        return target_val, val, target_val, meta_text

    title, img = await parse_og_meta(target_val)
    if img:
        t_img = img

    if title:
        if rule_type in ["specific_track", "specific_artist"] and not meta_text:
            meta_text = title
        if rule_type == "specific_artist":
            target_val = f"{title}||{target_val}"

    if rule_type == "specific_album":
        track_count = await get_album_track_count(target_val)
        if track_count > 0:
            val = track_count

    return target_val, val, t_img, meta_text


async def get_album_track_count(url: str) -> int:

    from app.utils import is_safe_url
    if not is_safe_url(url, allowed_domains=[YANDEX_MUSIC_DOMAIN, "open.spotify.com"]):
        return 0

    parsed_url = urllib.parse.urlparse(url)
    host = (parsed_url.hostname or "").lower()
    path = parsed_url.path or ""

    headers = {'User-Agent': USER_AGENT_MOZILLA}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
            if YANDEX_MUSIC_DOMAIN in host and ALBUM_PATH in path:
                album_id = path.split(ALBUM_PATH)[1].split('/')[0]
                res = (await client.get(f"https://{YANDEX_MUSIC_DOMAIN}/handlers/album.jsx?album={album_id}")).json()
                return res.get("trackCount", 0)
            elif host == "open.spotify.com" and ALBUM_PATH in path:
                # Hardcode domain to prevent SSRF alert
                safe_url = f"https://open.spotify.com{path}"
                resp = await client.get(safe_url)
                match = re.search(
                    r'music:song_count["\']\s+content=["\'](\d+)["\']',
                    resp.text,
                    re.IGNORECASE)
                if match:
                    return int(match.group(1))
    except Exception as e:
        logger.warning(f"Album track count error: {e}")
    return 0
