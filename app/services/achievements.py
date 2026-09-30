"""Achievement rules: auto-award checks and progress calculation."""

import logging
import re
import unicodedata
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
from app.services.cache import get_from_cache, set_to_cache
from app.services.notifications import push_allowed
from app.services.og_parser import parse_og_meta, yandex_api_meta
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
    count = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(
        Scrobble.user_id == user.id,
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
        Track.artist.ilike(f'%{target}%')).scalar() or 0
    return count >= ach.rule_value


def check_auto_achievements(user, db: Session) -> list[Achievement]:
    """Award every automatic achievement the user now qualifies for.

    Returns the newly awarded achievements."""
    awarded: list[Achievement] = []
    auto_achs = db.query(Achievement).filter(
        Achievement.rule_type != "manual").all()
    if not auto_achs:
        return awarded
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
                awarded.append(ach)
            except IntegrityError:
                # Already awarded by a concurrent check (unique constraint):
                # roll back so the reward XP is not granted twice.
                db.rollback()
    return awarded


async def notify_achievements_unlocked(user_id: int, achievements: list[dict]) -> None:
    """Send Web Push notifications and `achievement.unlocked` webhooks."""
    if not achievements:
        return
    from app.services.push_notifications import notify_user_push
    from app.services.webhooks import dispatch_webhook_event
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        push_enabled = not user or push_allowed(user, "achievements")
        for ach in achievements:
            await dispatch_webhook_event("achievement.unlocked", ach, user_id, db)
            if push_enabled:
                await notify_user_push(
                    user_id=user_id,
                    title=f"{ach.get('icon') or '🏆'} Новое достижение!",
                    body=f"{ach['name']} (+{ach.get('reward_xp') or 0} XP)",
                    url="/",
                    db=db,
                )
    except Exception:
        logger.exception("Failed to send achievement notifications")
    finally:
        db.close()


def _achievement_summary(ach: Achievement) -> dict:
    return {"id": ach.id, "name": ach.name, "icon": ach.icon, "reward_xp": ach.reward_xp}


def award_achievements_for_user(user_id: int) -> list[dict]:
    """Run the achievement check for a user in its own DB session."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return []
        return [_achievement_summary(a) for a in check_auto_achievements(user, db)]
    finally:
        db.close()


def run_check_achievements_bg(user_id: int):
    """In-process fallback when the arq worker is unavailable (runs in a thread)."""
    import asyncio
    awarded = award_achievements_for_user(user_id)
    if awarded:
        asyncio.run(notify_achievements_unlocked(user_id, awarded))


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
    # The same rule the award check uses: tracks played from the album's link
    current_val_url = 0
    if a.rule_target.startswith("http"):
        current_val_url = db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(
            Scrobble.user_id == user.id,
            Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
            Track.track_url.like(f"%{a.rule_target.split('?')[0]}%")).scalar() or 0
    return max(current_val_img, current_val_text, current_val_url)


def _specific_album_tracks(db: Session, user: User, a: Achievement) -> list[Track]:
    """Fully listened tracks selected by the same best-match rule as progress."""
    common = (
        Scrobble.user_id == user.id,
        Scrobble.listened_sec * 100
        >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
    )
    candidates: list[list[Track]] = []

    if a.target_image:
        candidates.append(
            db.query(Track).join(Scrobble).filter(
                *common, Track.cover_url == a.target_image
            ).distinct().all()
        )

    album_name = a.rule_meta if a.rule_meta else a.rule_target
    if a.rule_target and "||" in a.rule_target:
        album_name = a.rule_target.split("||")[0]
    if album_name and not album_name.startswith("http"):
        parts = [p.strip() for p in album_name.replace("—", "-").split("-")]
        filters = [Track.album.ilike(f"%{parts[-1]}%")]
        if len(parts) >= 2:
            filters.append(Track.artist.ilike(f"%{parts[0]}%"))
        candidates.append(
            db.query(Track).join(Scrobble).filter(*common, *filters).distinct().all()
        )

    if a.rule_target and a.rule_target.startswith("http"):
        target = a.rule_target.split("?")[0]
        candidates.append(
            db.query(Track).join(Scrobble).filter(
                *common, Track.track_url.like(f"%{target}%")
            ).distinct().all()
        )

    return max(candidates, key=len, default=[])


def _artist_name(a: Achievement) -> str:
    target = str(a.rule_target or "")
    return target.split("||", 1)[0].strip()


def _specific_artist_tracks(db: Session, user: User, a: Achievement) -> list[Track]:
    """Unique fully listened tracks by the achievement's artist."""
    artist = _artist_name(a)
    if not artist:
        return []
    return db.query(Track).join(Scrobble).filter(
        Scrobble.user_id == user.id,
        Scrobble.listened_sec * 100
        >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85,
        Track.artist.ilike(f"%{artist}%"),
    ).distinct().all()


def _normal_track_title(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKC", value or "").casefold().replace("ё", "е")
    return " ".join(re.findall(r"[\w]+", normalized, flags=re.UNICODE))


def _track_artist(item: dict) -> str:
    artists = item.get("artists") or []
    return ", ".join(
        str(artist.get("name")) for artist in artists
        if isinstance(artist, dict) and artist.get("name")
    )


def _parse_yandex_album_tracks(payload: dict, album_id: str) -> list[dict]:
    """Flatten both the public handler and /with-tracks API responses."""
    root = payload.get("result") if isinstance(payload.get("result"), dict) else payload
    volumes = root.get("volumes") if isinstance(root, dict) else None
    if not isinstance(volumes, list):
        return []

    result: list[dict] = []
    seen: set[str] = set()
    for volume in volumes:
        if not isinstance(volume, list):
            continue
        for item in volume:
            if not isinstance(item, dict) or not item.get("title"):
                continue
            track_id = str(item.get("id") or item.get("realId") or "")
            identity = track_id or _normal_track_title(str(item["title"]))
            if not identity or identity in seen:
                continue
            seen.add(identity)
            result.append({
                "id": track_id or None,
                "title": str(item["title"]),
                "artist": _track_artist(item),
                "url": (
                    f"https://{YANDEX_MUSIC_DOMAIN}/album/{album_id}/track/{track_id}"
                    if track_id else None
                ),
            })
    return result


def _yandex_track_item(item: dict) -> dict | None:
    if not item.get("title"):
        return None
    track_id = str(item.get("id") or item.get("realId") or "")
    albums = item.get("albums") or []
    album_id = str(albums[0].get("id") or "") if albums and isinstance(albums[0], dict) else ""
    if album_id and track_id:
        url = f"https://{YANDEX_MUSIC_DOMAIN}/album/{album_id}/track/{track_id}"
    elif track_id:
        url = f"https://{YANDEX_MUSIC_DOMAIN}/track/{track_id}"
    else:
        url = None
    return {
        "id": track_id or None,
        "title": str(item["title"]),
        "artist": _track_artist(item),
        "url": url,
    }


def _parse_yandex_artist_tracks(payload: dict) -> tuple[list[dict], int]:
    root = payload.get("result") if isinstance(payload.get("result"), dict) else payload
    raw_tracks = root.get("tracks") if isinstance(root, dict) else None
    if not isinstance(raw_tracks, list):
        return [], 0
    tracks = []
    for item in raw_tracks:
        parsed = _yandex_track_item(item) if isinstance(item, dict) else None
        if parsed:
            tracks.append(parsed)
    pager = root.get("pager") or {}
    total = int(pager.get("total") or len(tracks)) if isinstance(pager, dict) else len(tracks)
    return tracks, total


async def _yandex_album_tracks(url: str, token: str | None = None) -> list[dict]:
    match = re.search(r"/album/(\d+)", url or "")
    if not match:
        return []
    album_id = match.group(1)
    cache_key = f"achievement-album-tracks:yandex:{album_id}"
    cached = get_from_cache(cache_key, ttl=21600)
    if isinstance(cached, list):
        return cached

    headers = {"User-Agent": USER_AGENT_MOZILLA}
    requests: list[tuple[str, dict[str, str]]] = []
    if token:
        requests.append((
            f"https://api.music.yandex.net/albums/{album_id}/with-tracks",
            {**headers, "Authorization": f"OAuth {token}"},
        ))
    requests.append((
        f"https://{YANDEX_MUSIC_DOMAIN}/handlers/album.jsx?album={album_id}",
        headers,
    ))

    try:
        async with httpx.AsyncClient(timeout=7.0) as client:
            for endpoint, request_headers in requests:
                try:
                    response = await client.get(endpoint, headers=request_headers)
                    if response.status_code != 200:
                        continue
                    tracks = _parse_yandex_album_tracks(response.json(), album_id)
                    if tracks:
                        set_to_cache(cache_key, tracks, expire=21600)
                        return tracks
                except Exception as e:
                    logger.warning(f"Yandex album track list request error: {e}")
    except Exception as e:
        logger.warning(f"Yandex album track list error: {e}")
    return []


async def _yandex_artist_tracks(url: str, token: str | None = None) -> list[dict]:
    match = re.search(r"/artist/(\d+)", url or "")
    if not match or not token:
        return []
    artist_id = match.group(1)
    cache_key = f"achievement-artist-tracks:yandex:{artist_id}"
    cached = get_from_cache(cache_key, ttl=21600)
    if isinstance(cached, list):
        return cached

    headers = {
        "Authorization": f"OAuth {token}",
        "User-Agent": USER_AGENT_MOZILLA,
    }
    tracks: list[dict] = []
    seen: set[str] = set()
    page = 0
    total = 1
    try:
        async with httpx.AsyncClient(timeout=7.0) as client:
            while len(tracks) < total:
                response = await client.get(
                    f"https://api.music.yandex.net/artists/{artist_id}/tracks",
                    headers=headers,
                    params={"page": page, "page-size": 100},
                )
                if response.status_code != 200:
                    break
                batch, total = _parse_yandex_artist_tracks(response.json())
                if not batch:
                    break
                for track in batch:
                    identity = str(track.get("id") or _normal_track_title(track.get("title")))
                    if identity and identity not in seen:
                        seen.add(identity)
                        tracks.append(track)
                page += 1
    except Exception as e:
        logger.warning(f"Yandex artist track list error: {e}")
    if tracks:
        set_to_cache(cache_key, tracks, expire=21600)
    return tracks


def _catalog_album_tracks(db: Session, a: Achievement) -> list[dict]:
    """Use the local catalogue when the provider cannot return a track list."""
    queries = []
    if a.target_image:
        queries.append(db.query(Track).filter(Track.cover_url == a.target_image).all())
    if a.rule_target and a.rule_target.startswith("http"):
        target = a.rule_target.split("?")[0]
        queries.append(db.query(Track).filter(Track.track_url.like(f"%{target}%")).all())
    album_name = a.rule_meta if a.rule_meta else a.rule_target
    if album_name and not album_name.startswith("http"):
        parts = [p.strip() for p in album_name.replace("—", "-").split("-")]
        query = db.query(Track).filter(Track.album.ilike(f"%{parts[-1]}%"))
        if len(parts) >= 2:
            query = query.filter(Track.artist.ilike(f"%{parts[0]}%"))
        queries.append(query.all())

    tracks = max(queries, key=len, default=[])
    result: list[dict] = []
    seen: set[str] = set()
    for track in tracks:
        title = str(track.title or "")
        identity = _normal_track_title(title)
        if not identity or identity in seen:
            continue
        seen.add(identity)
        result.append({
            "id": None,
            "title": title,
            "artist": str(track.artist or ""),
            "url": str(track.track_url) if track.track_url else None,
        })
    return result


def _catalog_artist_tracks(db: Session, a: Achievement) -> list[dict]:
    artist = _artist_name(a)
    if not artist:
        return []
    tracks = db.query(Track).filter(Track.artist.ilike(f"%{artist}%")).all()
    result: list[dict] = []
    seen: set[str] = set()
    for track in tracks:
        title = str(track.title or "")
        identity = _normal_track_title(title)
        if not identity or identity in seen:
            continue
        seen.add(identity)
        result.append({
            "id": _track_id_from_url(str(track.track_url) if track.track_url else None),
            "title": title,
            "artist": str(track.artist or ""),
            "url": str(track.track_url) if track.track_url else None,
        })
    return result


def _track_id_from_url(value: str | None) -> str | None:
    match = re.search(r"/track/(\d+)", value or "")
    return match.group(1) if match else None


def _track_progress_rows(canonical: list[dict], listened: list[Track]) -> list[dict]:
    listened_ids = {
        _track_id_from_url(str(track.track_url) if track.track_url else None)
        for track in listened
    }
    listened_ids.discard(None)
    listened_titles = {
        _normal_track_title(str(track.title or "")) for track in listened
    }
    rows = []
    for track in canonical:
        is_listened = (
            (track.get("id") and str(track["id"]) in listened_ids)
            or _normal_track_title(track.get("title")) in listened_titles
        )
        rows.append({**track, "listened": bool(is_listened)})
    represented_titles = {
        _normal_track_title(track.get("title"))
        for track in rows if track["listened"]
    }
    for track in listened:
        title = str(track.title or "")
        identity = _normal_track_title(title)
        if not identity or identity in represented_titles:
            continue
        represented_titles.add(identity)
        rows.append({
            "id": _track_id_from_url(
                str(track.track_url) if track.track_url else None),
            "title": title,
            "artist": str(track.artist or ""),
            "url": str(track.track_url) if track.track_url else None,
            "listened": True,
        })
    return rows


async def get_album_track_progress(
        db: Session, user: User, a: Achievement) -> dict:
    """Return the exact album tracks already counted and still required."""
    target = str(a.rule_target or "")
    token = (
        str(user.integration.yandex_token)
        if user.integration and user.integration.yandex_token else None
    )
    canonical: list[dict] = []
    if YANDEX_MUSIC_DOMAIN in target:
        canonical = await _yandex_album_tracks(target, token)
    if not canonical:
        canonical = _catalog_album_tracks(db, a)

    expected = int(a.rule_value or 0)
    if not canonical or (expected and len(canonical) < expected):
        listened_count = _calc_specific_album(db, user, a)
        return {
            "available": False,
            "tracks": [],
            "listened_count": listened_count,
            "remaining_count": max(expected - listened_count, 0),
            "total_count": expected,
        }

    rows = _track_progress_rows(canonical, _specific_album_tracks(db, user, a))
    listened_count = sum(1 for track in rows if track["listened"])
    return {
        "available": True,
        "tracks": rows,
        "listened_count": listened_count,
        "remaining_count": len(rows) - listened_count,
        "total_count": len(rows),
    }


async def get_artist_track_progress(
        db: Session, user: User, a: Achievement) -> dict:
    """Return unique artist tracks already counted and possible next tracks."""
    target = str(a.rule_target or "")
    target_url = target.rsplit("||", 1)[-1]
    token = (
        str(user.integration.yandex_token)
        if user.integration and user.integration.yandex_token else None
    )
    canonical: list[dict] = []
    if YANDEX_MUSIC_DOMAIN in target_url:
        canonical = await _yandex_artist_tracks(target_url, token)
    if not canonical:
        canonical = _catalog_artist_tracks(db, a)

    expected = int(a.rule_value or 0)
    listened = _specific_artist_tracks(db, user, a)
    if not canonical or (expected and len(canonical) < expected):
        listened_count = len(listened)
        return {
            "available": False,
            "tracks": [],
            "listened_count": listened_count,
            "remaining_count": max(expected - listened_count, 0),
            "total_count": expected,
        }

    rows = _track_progress_rows(canonical, listened)
    listened_count = sum(1 for track in rows if track["listened"])
    return {
        "available": True,
        "tracks": rows,
        "listened_count": listened_count,
        "remaining_count": max(expected - listened_count, 0),
        "total_count": expected,
    }


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
        return db.query(func.count(func.distinct(Scrobble.track_id))).join(Track).filter(Scrobble.user_id == user.id, Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85, Track.artist.ilike(f'%{a.rule_target.split("||")[0] if "||" in a.rule_target else a.rule_target}%')).scalar() or 0
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


DEEZER_KIND = {"specific_album": "album", "specific_track": "track", "specific_artist": "artist"}


async def _deezer_cover(rule_type: str, query: str | None) -> str | None:
    """Cover by name ("Джизус - Проводник") when the link gave none."""
    from app.services.metadata_search import _search_deezer

    if not query or not query.strip():
        return None
    words = " ".join(p.strip() for p in query.replace("—", "-").split(" - ") if p.strip())
    async with httpx.AsyncClient(timeout=5.0) as client:
        found = await _search_deezer(client, words, DEEZER_KIND[rule_type], limit=1)
    return found[0]["cover"] or None if found else None


async def _link_meta(target_val: str, yandex_token: str | None) -> tuple[str | None, str | None, int]:
    """(title, cover, album track count) of the achievement's link."""
    title, img, tracks = None, None, 0
    if YANDEX_MUSIC_DOMAIN in target_val and yandex_token:
        title, img, tracks = await yandex_api_meta(target_val, yandex_token)
    if not img:
        og_title, og_img = await parse_og_meta(target_val)
        title, img = title or og_title, og_img
    return title, img, tracks


def _target_link(target_val: str) -> str | None:
    """Raw URL, including stored artist targets in the "Name||url" form."""
    candidate = target_val.rsplit("||", 1)[-1].strip()
    return candidate if candidate.startswith("http") else None


async def _enrich_achievement_data(rule_type: str, target_val: str, val: int, t_img: str, meta_text: str,
                                   yandex_token: str | None = None):
    is_valid_type = rule_type in ["specific_track", "specific_album", "specific_artist"]
    target_link = _target_link(target_val)

    if not is_valid_type or not target_link:
        return target_val, val, t_img, meta_text

    is_internal_image = YANDEX_AVATARS in target_link or SCDN_CO in target_link
    if is_internal_image:
        return target_val, val, target_link, meta_text

    title, img, api_tracks = await _link_meta(target_link, yandex_token)
    t_img = img or await _deezer_cover(rule_type, meta_text or title) or t_img
    target_val, meta_text = _apply_link_title(
        rule_type, title, target_link, meta_text)

    track_count = api_tracks
    if rule_type == "specific_album" and not track_count:
        track_count = await get_album_track_count(target_link)
    if rule_type in ["specific_album", "specific_artist"] and track_count > 0:
        val = track_count

    return target_val, val, t_img, meta_text


def _apply_link_title(rule_type: str, title: str | None, target_val: str, meta_text: str) -> tuple[str, str]:
    """The link's title names a track or artist goal when none was given; an
    artist goal keeps it in front of the link ("Name||url")."""
    if not title:
        return target_val, meta_text
    if rule_type in ["specific_track", "specific_artist"] and not meta_text:
        meta_text = title
    if rule_type == "specific_artist":
        target_val = f"{title}||{target_val}"
    return target_val, meta_text


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
