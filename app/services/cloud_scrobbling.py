import asyncio
import os
from datetime import UTC, datetime

import httpx
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import User

# We will import process_scrobble locally or pass it as a callback to
# avoid circular imports.

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")


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
            print(f"Token refresh error: {e}")
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
            print(f"Spotify sync error: {e}")


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


async def _fetch_yandex_track_info(client: httpx.AsyncClient, track_id, headers: dict, process_func, db: Session, user: User, is_playing: bool = True):
    try:
        t_resp = await client.get(f"https://api.music.yandex.net/tracks?trackIds={track_id}", headers=headers, timeout=5.0)
        if t_resp.status_code != 200:
            t_resp = await client.post("https://api.music.yandex.net/tracks", data={"track-ids": [str(track_id)]}, headers=headers, timeout=5.0)
        if t_resp.status_code != 200:
            return

        t_info = t_resp.json().get("result", [])
        if not t_info:
            return
        t_info = t_info[0]

        title = t_info.get("title")
        artist = ", ".join([a.get("name") for a in t_info.get("artists", []) if isinstance(a, dict) and "name" in a]) or "Unknown Artist"
        cover_uri = t_info.get("coverUri") or (t_info.get("albums", [{}])[0].get("coverUri") if t_info.get("albums") else None)
        cover = ("https://" + cover_uri.replace("%%", "400x400")) if cover_uri else None
        duration = int(t_info.get("durationMs", 0) / 1000)
        track_url = f"https://music.yandex.ru/track/{track_id}"

        albums = t_info.get("albums", [])
        album = albums[0].get("title") if albums else None

        await process_func(
            db, user, title, artist, cover,
            track_url, "yandex", 0, is_playing,
            duration, album
        )
    except Exception as e:
        print(f"Error fetching Yandex track {track_id}: {e}")


def _is_queue_playing(active_queue: dict) -> bool:
    modified_str = active_queue.get("modified")
    if not modified_str:
        return True
    try:
        modified_dt = datetime.fromisoformat(modified_str.replace("Z", "+00:00"))
        return (datetime.now(UTC) - modified_dt).total_seconds() < 600
    except Exception:
        return True


async def _handle_active_yandex_queue(client: httpx.AsyncClient, active_queue: dict, headers: dict, process_func, db: Session, user: User):
    q_id = active_queue.get("id")
    if not q_id:
        return
    is_playing = _is_queue_playing(active_queue)
    q_resp = await client.get(f"https://api.music.yandex.net/queues/{q_id}", headers=headers, timeout=5.0)
    if q_resp.status_code != 200:
        return
    q_result = q_resp.json().get("result", {})
    current_idx = q_result.get("currentIndex") if q_result.get("currentIndex") is not None else q_result.get("current_index")
    tracks = q_result.get("tracks", [])

    if current_idx is not None and current_idx < len(tracks):
        track_obj = tracks[current_idx]
        track_id = None
        if isinstance(track_obj, dict):
            track_id = track_obj.get("trackId") or track_obj.get("id")
        elif isinstance(track_obj, (str, int)):
            track_id = str(track_obj).split(":")[0] if ":" in str(track_obj) else str(track_obj)
            
        if track_id:
            await _fetch_yandex_track_info(client, track_id, headers, process_func, db, user, is_playing)


async def sync_yandex_status(user: User, db: Session, process_func):
    async with httpx.AsyncClient() as client:
        try:
            headers = {
                "Authorization": f"OAuth {user.integration.yandex_token}",
                "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
                "User-Agent": "Yandex-Music-API",
                "X-Yandex-Music-Device": "os=unknown; os_version=unknown; manufacturer=unknown; model=unknown; clid=unknown; device_id=unknown; uuid=unknown"
            }
            resp = await client.get("https://api.music.yandex.net/queues", headers=headers, timeout=5.0)
            if resp.status_code in (401, 403):
                print(f"Yandex OAuth token invalid or expired for user {user.username}")
                return
            if resp.status_code == 200:
                queues = resp.json().get("result", {}).get("queues", [])
                if queues:
                    queues.sort(key=lambda x: x.get("modified", ""), reverse=True)
                    await _handle_active_yandex_queue(client, queues[0], headers, process_func, db, user)
        except Exception as e:
            print(f"Yandex sync error for user {user.username}: {e}")


async def poll_user(user_id: int, process_func):
    import random
    # Add jitter inside the task itself so all tasks run concurrently
    await asyncio.sleep(random.uniform(0.1, 2.0))
    local_db = SessionLocal()
    try:
        u = local_db.query(User).filter(User.id == user_id).first()
        if not u:
            return

        if u.integration.spotify_refresh_token:
            await sync_spotify_status(u, local_db, process_func)

        if u.integration.yandex_token:
            await sync_yandex_status(u, local_db, process_func)

        u.integration.last_sync = datetime.now(UTC)
        local_db.commit()
    except Exception as e:
        print(f"Error polling user {user_id}: {e}")
    finally:
        local_db.close()


async def poll_external_services(process_func):
    """
    Основной цикл облачного скробблинга.
    """
    while True:
        db = SessionLocal()
        try:
            from app.models import UserIntegration
            users = db.query(User).join(UserIntegration).filter(
                (UserIntegration.spotify_refresh_token is not None) | (
                    UserIntegration.yandex_token is not None)).all()

            if users:
                tasks = [poll_user(u.id, process_func) for u in users]
                await asyncio.gather(*tasks)

        except Exception as e:
            print(f"Cloud Worker Global Error: {e}")
        finally:
            db.close()
        await asyncio.sleep(30)
