import asyncio
import json
import logging
import os
import re
from datetime import UTC, datetime, timedelta
from typing import cast

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import User
from app.services import runtime_settings, yandex_ynison
from app.services.user_preferences import get_preferences

logger = logging.getLogger(__name__)

# A queue track counts as playing until its length plus this margin (one poll
# interval and a bit) has passed since the queue last changed
YANDEX_PLAYING_MARGIN_SEC = 45

# We will import process_scrobble locally or pass it as a callback to
# avoid circular imports.

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SOUNDCLOUD_CLIENT_ID = os.getenv("SOUNDCLOUD_CLIENT_ID")
SOUNDCLOUD_CLIENT_SECRET = os.getenv("SOUNDCLOUD_CLIENT_SECRET")
SOUNDCLOUD_RECENT_URL = "https://api.soundcloud.com/me/recently-played/tracks"
SOUNDCLOUD_PLAYING_MARGIN_SEC = 45


async def refresh_spotify_token(user: User, db: Session):
    if not user.integration.spotify_refresh_token:
        return None
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post("https://accounts.spotify.com/api/token", data={
                "grant_type": "refresh_token",
                "refresh_token": user.integration.spotify_refresh_token,
                "client_id": SPOTIFY_CLIENT_ID,
                "client_secret": SPOTIFY_CLIENT_SECRET
            }, headers={"Content-Type": "application/x-www-form-urlencoded"})
            if resp.status_code == 200:
                data = resp.json()
                user.integration.spotify_access_token = data["access_token"]
                db.commit()
                return data["access_token"]
        except Exception as e:
            logger.warning(f"Token refresh error: {e}")
    return None


async def sync_spotify_status(user: User, db: Session, process_func):
    token = user.integration.spotify_access_token
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {token}"}
        try:
            resp = await client.get("https://api.spotify.com/v1/me/player/currently-playing", headers=headers)

            if resp.status_code == 401:
                token = await refresh_spotify_token(user, db)
                if token:
                    headers = {"Authorization": f"Bearer {token}"}
                    resp = await client.get("https://api.spotify.com/v1/me/player/currently-playing", headers=headers)

            if resp.status_code == 200:
                data = resp.json()
                if data and data.get("is_playing"):
                    item = data.get("item")
                    if not item:
                        return
                    title = item.get("name")
                    artist = ", ".join([a["name"]
                                       for a in item.get("artists", [])])
                    cover = item.get(
                        "album", {}).get(
                        "images", [
                            {}])[0].get("url")
                    track_url = item.get("external_urls", {}).get("spotify")
                    duration = int(item.get("duration_ms", 0) / 1000)
                    progress = int(data.get("progress_ms", 0) / 1000)
                    album = item.get("album", {}).get("name")

                    await process_func(db, user, title, artist, cover, track_url, "spotify", progress, True, duration, album)
        except Exception as e:
            logger.warning(f"Spotify sync error: {e}")


def _soundcloud_expiry(expires_in) -> datetime:
    try:
        seconds = max(int(expires_in), 60)
    except (TypeError, ValueError):
        seconds = 3600
    return datetime.now(UTC) + timedelta(seconds=seconds)


def _utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


async def refresh_soundcloud_token(user: User, db: Session) -> str | None:
    refresh_token = cast(str | None, user.integration.soundcloud_refresh_token)
    if not refresh_token or not SOUNDCLOUD_CLIENT_ID or not SOUNDCLOUD_CLIENT_SECRET:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://secure.soundcloud.com/oauth/token",
                data={
                    "grant_type": "refresh_token",
                    "client_id": SOUNDCLOUD_CLIENT_ID,
                    "client_secret": SOUNDCLOUD_CLIENT_SECRET,
                    "refresh_token": refresh_token,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if response.status_code != 200:
            logger.warning(
                "SoundCloud token refresh answered %s for user %s",
                response.status_code,
                user.username,
            )
            return None
        data = response.json()
        access_token = data.get("access_token")
        if not access_token:
            return None
        user.integration.soundcloud_access_token = access_token
        if data.get("refresh_token"):
            user.integration.soundcloud_refresh_token = data["refresh_token"]
        user.integration.soundcloud_token_expires_at = _soundcloud_expiry(
            data.get("expires_in")
        )
        db.commit()
        return str(access_token)
    except Exception as exc:
        logger.warning("SoundCloud token refresh error: %s", exc)
        return None


def _soundcloud_tracks(payload) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("collection", "tracks"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def _soundcloud_track_key(track: dict) -> str:
    return str(
        track.get("urn")
        or track.get("id")
        or track.get("permalink_url")
        or ""
    )


def _soundcloud_history(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if item]


def _new_soundcloud_items(previous: list[str], current: list[str]) -> list[str]:
    """Return items inserted at the front of SoundCloud's recent history.

    Comparing the whole queue, rather than only its head, detects a replay of
    the same track (``[A, A, B]`` after ``[A, B, C]``). If no overlap exists,
    treat the response as a new baseline instead of importing uncertain plays.
    """
    if not previous or not current:
        return []
    # Exclude ``added == len(current)``: an empty remainder would match every
    # previous queue and falsely classify a completely unrelated response as
    # all-new history.
    for added in range(len(current)):
        remainder = current[added:]
        if remainder == previous[:len(remainder)]:
            return current[:added]
    return []


def _soundcloud_artwork(url: str | None) -> str:
    if not url:
        return ""
    return re.sub(r"-(?:large|t\d+x\d+)(?=\.[a-z]+(?:\?|$))", "-t500x500", url)


def _soundcloud_metadata(track: dict) -> dict | None:
    title = str(track.get("title") or "").strip()
    raw_user = track.get("user")
    user = raw_user if isinstance(raw_user, dict) else {}
    raw_publisher = track.get("publisher_metadata")
    publisher = raw_publisher if isinstance(raw_publisher, dict) else {}
    artist = str(
        user.get("username")
        or publisher.get("artist")
        or publisher.get("writer_composer")
        or ""
    ).strip()
    if not title or not artist:
        return None
    try:
        duration = max(int(track.get("duration") or 0) // 1000, 0)
    except (TypeError, ValueError):
        duration = 0
    return {
        "title": title,
        "artist": artist,
        "cover": _soundcloud_artwork(track.get("artwork_url")),
        "track_url": str(track.get("permalink_url") or ""),
        "duration": duration,
        "album": str(
            publisher.get("album_title")
            or publisher.get("release_title")
            or ""
        ),
    }


async def _soundcloud_recent_response(user: User, db: Session) -> httpx.Response | None:
    token = cast(str | None, user.integration.soundcloud_access_token)
    expires_at = _utc(
        cast(datetime | None, user.integration.soundcloud_token_expires_at)
    )
    if expires_at and expires_at <= datetime.now(UTC) + timedelta(seconds=30):
        token = await refresh_soundcloud_token(user, db)
    if not token:
        return None

    async with httpx.AsyncClient(timeout=10.0) as client:
        headers = {
            "Accept": "application/json; charset=utf-8",
            "Authorization": f"OAuth {token}",
        }
        response = await client.get(
            SOUNDCLOUD_RECENT_URL,
            params={"limit": 25, "linked_partitioning": "true"},
            headers=headers,
        )
        if response.status_code == 401:
            token = await refresh_soundcloud_token(user, db)
            if not token:
                return response
            headers["Authorization"] = f"OAuth {token}"
            response = await client.get(
                SOUNDCLOUD_RECENT_URL,
                params={"limit": 25, "linked_partitioning": "true"},
                headers=headers,
            )
        return response


async def sync_soundcloud_status(user: User, db: Session, process_func) -> None:
    """Poll official listening history and maintain an approximate live play.

    SoundCloud exposes recent tracks but not a live position. A newly inserted
    history item starts a server-timed session; repeated polls advance it until
    the track duration. The first response is only a baseline, so linking an
    account never imports old listens or grants achievements retroactively.
    """
    try:
        response = await _soundcloud_recent_response(user, db)
        if response is None:
            return
        if response.status_code != 200:
            logger.warning(
                "SoundCloud recent tracks answered %s for user %s",
                response.status_code,
                user.username,
            )
            return
        tracks = _soundcloud_tracks(response.json())
        keys = [_soundcloud_track_key(track) for track in tracks]
        keys = [key for key in keys if key]
        if not keys:
            return

        integration = user.integration
        previous = _soundcloud_history(
            cast(str | None, integration.soundcloud_recent_tracks)
        )
        new_items = _new_soundcloud_items(previous, keys)
        integration.soundcloud_recent_tracks = json.dumps(keys, separators=(",", ":"))

        # First poll establishes a baseline. Without timestamps, treating its
        # head as live would create a phantom play from an old history entry.
        if not previous:
            integration.soundcloud_current_track = None
            integration.soundcloud_track_started_at = None
            db.commit()
            return

        head = keys[0]
        now = datetime.now(UTC)
        if new_items:
            integration.soundcloud_current_track = head
            integration.soundcloud_track_started_at = now
            db.commit()
        elif integration.soundcloud_current_track != head:
            db.commit()
            return

        started_at = _utc(
            cast(datetime | None, integration.soundcloud_track_started_at)
        )
        if started_at is None:
            db.commit()
            return
        metadata = _soundcloud_metadata(tracks[0])
        if metadata is None:
            db.commit()
            return

        progress = max(int((now - started_at).total_seconds()), 0)
        duration = metadata["duration"] or 180
        is_playing = progress < duration + SOUNDCLOUD_PLAYING_MARGIN_SEC
        await process_func(
            db,
            user,
            metadata["title"],
            metadata["artist"],
            metadata["cover"],
            metadata["track_url"],
            "soundcloud",
            min(progress, duration),
            is_playing,
            metadata["duration"],
            metadata["album"],
        )
        if not is_playing:
            integration.soundcloud_current_track = None
            integration.soundcloud_track_started_at = None
            db.commit()
    except Exception as exc:
        logger.warning("SoundCloud sync error for user %s: %s", user.username, exc)


def _parse_yandex_now_playing(data: dict):
    result = data.get("result")
    if not isinstance(result, dict):
        return None
    np = result.get("nowPlaying")
    if not isinstance(np, dict):
        return None
    track_data = np.get("track")
    if not isinstance(track_data, dict):
        return None

    title = track_data.get("title")
    artist = ", ".join([a["name"] for a in track_data.get(
        "artists", []) if isinstance(a, dict) and "name" in a])
    cover_uri = track_data.get("coverUri")
    cover = "https://" + \
        cover_uri.replace("%%", "400x400") if cover_uri else None
    track_id = track_data.get("id")
    track_url = f"https://music.yandex.ru/track/{track_id}"
    duration = int(track_data.get("durationMs", 0) / 1000)
    progress = int(np.get("progressMs", 0) / 1000)

    albums = track_data.get("albums")
    album = None
    if isinstance(
            albums,
            list) and len(albums) > 0 and isinstance(
            albums[0],
            dict):
        album = albums[0].get("title")

    return {
        "title": title,
        "artist": artist,
        "cover": cover,
        "track_url": track_url,
        "duration": duration,
        "progress": progress,
        "album": album
    }


# Track metadata by Yandex track id: the live listener reports the same
# track every few seconds, and /tracks answers never change for an id
_TRACK_INFO_CACHE: dict[str, dict] = {}
_TRACK_INFO_CACHE_MAX = 1000


async def _yandex_track_info(client, track_id: str, headers: dict, username: str) -> dict | None:
    cached = _TRACK_INFO_CACHE.get(str(track_id))
    if cached is not None:
        return cached
    t_resp = await client.post("https://api.music.yandex.net/tracks", data={"track-ids": [track_id]}, headers=headers, timeout=5.0)
    if t_resp.status_code != 200:
        logger.warning(f"Yandex /tracks answered {t_resp.status_code} for user {username}")
        return None
    result = t_resp.json().get("result", [])
    if not result:
        return None
    t_info = result[0]
    cover_uri = t_info.get("coverUri")
    albums = t_info.get("albums") or []
    info = {
        "title": t_info.get("title"),
        "artist": ", ".join([a.get("name") for a in t_info.get("artists", []) if "name" in a]),
        "cover": "https://" + cover_uri.replace("%%", "400x400") if cover_uri else None,
        "duration": int(t_info.get("durationMs", 0) / 1000),
        "album": albums[0].get("title") if albums else None,
    }
    if len(_TRACK_INFO_CACHE) >= _TRACK_INFO_CACHE_MAX:
        _TRACK_INFO_CACHE.clear()
    _TRACK_INFO_CACHE[str(track_id)] = info
    return info


async def _fetch_yandex_track_info(client, track_id, headers, process_func, db, user,
                                   changed_at: datetime | None = None,
                                   position: tuple[int, bool] | None = None,
                                   credit_sec: int | None = None,
                                   pending_sec: int = 0):
    """Look the track up and report it; returns process_func's status (None
    if the track could not be looked up). `position` is (progress_sec,
    is_playing) when known (Ynison); otherwise it is estimated from the time
    the play queue last changed. `credit_sec`, `pending_sec`: see
    process_scrobble."""
    info = await _yandex_track_info(client, track_id, headers, user.username)
    if info is None:
        return None
    track_url = f"https://music.yandex.ru/track/{track_id}"
    progress, is_playing = position or _estimate_queue_position(changed_at, info["duration"])
    extra = {} if credit_sec is None else {"credit_sec": credit_sec, "pending_sec": pending_sec}
    return await process_func(
        db, user, info["title"], info["artist"], info["cover"],
        track_url, "yandex", progress, is_playing,
        info["duration"], info["album"], **extra
    )


def _queue_changed_at(active_queue: dict) -> datetime | None:
    modified_str = active_queue.get("modified")
    if not modified_str:
        return None
    try:
        return datetime.fromisoformat(modified_str.replace("Z", "+00:00"))
    except ValueError:
        return None


def _estimate_queue_position(changed_at: datetime | None, duration: int,
                             now: datetime | None = None) -> tuple[int, bool]:
    """(progress_sec, is_playing) of the current queue track.

    Yandex updates the queue's `modified` when the current track changes,
    not while it plays. So the track counts as playing until its length (plus
    a margin for the poll interval) has passed since that change, and the
    progress is the time since the change. Treating it as stopped a minute
    after the change, as before, meant no track longer than ~70 s ever
    reached the listen threshold.
    """
    if changed_at is None:
        return 0, True
    elapsed = int(((now or datetime.now(UTC)) - changed_at).total_seconds())
    if elapsed < 0:
        return 0, True
    track_len = duration if duration > 0 else 180
    return min(elapsed, track_len), elapsed < track_len + YANDEX_PLAYING_MARGIN_SEC


async def _handle_active_yandex_queue(client: httpx.AsyncClient, active_queue: dict, headers: dict, process_func, db: Session, user: User):
    q_id = active_queue.get("id")
    if not q_id:
        return
    q_resp = await client.get(f"https://api.music.yandex.net/queues/{q_id}", headers=headers, timeout=5.0)
    if q_resp.status_code != 200:
        logger.warning(f"Yandex /queues/<id> answered {q_resp.status_code} for user {user.username}")
        return
    q_result = q_resp.json().get("result", {})
    current_idx = q_result.get("currentIndex")
    tracks = q_result.get("tracks", [])

    if current_idx is not None and current_idx < len(tracks):
        track_obj = tracks[current_idx]
        track_id = track_obj.get("trackId")
        if track_id:
            await _fetch_yandex_track_info(client, track_id, headers, process_func, db, user,
                                           _queue_changed_at(active_queue))


def _yandex_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"OAuth {token}",
        "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
        "User-Agent": "Yandex-Music-API",
        "X-Yandex-Music-Device": "os=unknown; os_version=unknown; manufacturer=unknown; model=unknown; clid=unknown; device_id=unknown; uuid=unknown"
    }


async def sync_yandex_status(user: User, db: Session, process_func):
    """Report the user's current Yandex Music track.

    Current clients sync the player through Ynison; the old REST play queue
    stays empty for them, so it is only a fallback for when Ynison fails."""
    token = user.integration.yandex_token
    headers = _yandex_headers(token)
    try:
        playback = await yandex_ynison.fetch_playback(token)
    except Exception as e:
        logger.warning(f"Ynison unavailable for user {user.username}, trying /queues: {e}")
    else:
        if playback is not None:
            async with httpx.AsyncClient() as client:
                await _fetch_yandex_track_info(
                    client, playback.track_id, headers, process_func, db, user,
                    position=(playback.progress_sec, playback.playing))
        return
    await _sync_yandex_queue(user, db, process_func, headers)


async def _sync_yandex_queue(user: User, db: Session, process_func, headers: dict[str, str]):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get("https://api.music.yandex.net/queues", headers=headers, timeout=5.0)
            if resp.status_code in (401, 403):
                logger.warning(f"Yandex OAuth token invalid or expired for user {user.username}")
                return
            if resp.status_code != 200:
                logger.warning(f"Yandex /queues answered {resp.status_code} for user {user.username}")
                return
            queues = resp.json().get("result", {}).get("queues", [])
            if not queues:
                logger.info(f"Yandex returned no play queues for user {user.username}")
            else:
                queues.sort(key=lambda x: x.get("modified", ""), reverse=True)
                await _handle_active_yandex_queue(client, queues[0], headers, process_func, db, user)
        except Exception as e:
            logger.warning(f"Yandex sync error for user {user.username}: {e}")


POLL_CONCURRENCY = 5
POLL_INTERVAL_SEC = 30
POLL_LOCK_KEY = "cloud_poll_lock"
POLL_LOCK_TTL = 25


async def poll_user(user_id: int, process_func):
    import random
    # Add jitter inside the task itself so all tasks run concurrently
    await asyncio.sleep(random.uniform(0.1, 2.0))
    local_db = SessionLocal()
    try:
        u = local_db.query(User).filter(User.id == user_id).first()
        if not u:
            return
        integrations = get_preferences(u.profile).integrations
        if not integrations.auto_sync:
            return

        # Same per-user lock as POST /api/scrobble, so cloud polling and
        # client scrobbles never process concurrently for one user.
        from app.core.redis import redis_lock
        spotify_enabled = runtime_settings.is_feature_enabled("integration_spotify", local_db)
        yandex_enabled = runtime_settings.is_feature_enabled("integration_yandex", local_db)
        soundcloud_enabled = runtime_settings.is_feature_enabled("integration_soundcloud", local_db)
        async with redis_lock(f"scrobble_lock:{user_id}", expire_sec=30):
            if (spotify_enabled and integrations.spotify_enabled
                    and u.integration.spotify_refresh_token):
                await sync_spotify_status(u, local_db, process_func)

            # A user with an open live Ynison connection is reported by it
            from app.services.yandex_live import connected as live_users
            if (yandex_enabled and integrations.yandex_enabled
                    and u.integration.yandex_token and user_id not in live_users):
                await sync_yandex_status(u, local_db, process_func)

            if (soundcloud_enabled and integrations.soundcloud_enabled
                    and u.integration.soundcloud_refresh_token):
                await sync_soundcloud_status(u, local_db, process_func)

        u.integration.last_sync = datetime.now(UTC)
        local_db.commit()
    except Exception as e:
        logger.warning(f"Error polling user {user_id}: {e}")
    finally:
        local_db.close()


def get_pollable_user_ids(db: Session) -> list[int]:
    """IDs of non-banned users with a linked cloud music account."""
    from app.models import UserIntegration
    # NB: must be SQL expressions (.isnot); a Python `x is not None` on a
    # Column evaluates to True and would select every user.
    providers = []
    if runtime_settings.is_feature_enabled("integration_spotify", db):
        providers.append(UserIntegration.spotify_refresh_token.isnot(None))
    if runtime_settings.is_feature_enabled("integration_yandex", db):
        providers.append(UserIntegration.yandex_token.isnot(None))
    if runtime_settings.is_feature_enabled("integration_soundcloud", db):
        providers.append(UserIntegration.soundcloud_refresh_token.isnot(None))
    if not providers:
        return []
    return [row[0] for row in db.query(User.id).join(UserIntegration).filter(
        User.is_banned.isnot(True), or_(*providers)).all()]


def _load_pollable_user_ids() -> list[int]:
    db = SessionLocal()
    try:
        return get_pollable_user_ids(db)
    finally:
        db.close()


async def poll_once(process_func) -> None:
    """Poll all linked accounts once.

    Guarded by a Redis lock so that only one process (API worker or arq
    worker) polls at a time; without Redis it simply runs locally."""
    from app.core.redis import get_redis_client

    lock_acquired = True
    client = None
    try:
        client = get_redis_client()
        lock_acquired = bool(await client.set(POLL_LOCK_KEY, "1", nx=True, ex=POLL_LOCK_TTL))
    except Exception:
        client = None  # Redis unavailable: single-process fallback
    if not lock_acquired:
        return

    try:
        user_ids = await asyncio.to_thread(_load_pollable_user_ids)

        if user_ids:
            # Bound concurrency so polling never exhausts the DB pool
            semaphore = asyncio.Semaphore(POLL_CONCURRENCY)

            async def _bounded_poll(uid: int):
                async with semaphore:
                    await poll_user(uid, process_func)

            await asyncio.gather(*(_bounded_poll(uid) for uid in user_ids))
    finally:
        if client is not None:
            try:
                await client.delete(POLL_LOCK_KEY)
            except Exception:
                logger.debug("Failed to release cloud poll lock", exc_info=True)


async def poll_external_services(process_func):
    """Основной цикл облачного скробблинга (используется без arq-воркера)."""
    while True:
        try:
            await poll_once(process_func)
        except Exception:
            logger.exception("Cloud Worker Global Error")
        await asyncio.sleep(POLL_INTERVAL_SEC)
