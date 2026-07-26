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


async def sync_yandex_status(user: User, db: Session, process_func):
    async with httpx.AsyncClient() as client:
        try:
            headers = {
                "Authorization": f"OAuth {user.integration.yandex_token}",
                "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
                "User-Agent": "Yandex-Music-API"
            }
            resp = await client.get("https://api.music.yandex.net/external-api/status", headers=headers, timeout=5.0)
            if resp.status_code == 403:
                print(
                    f"Yandex OAuth token invalid or expired for user {user.username}")
                return
            if resp.status_code == 200:
                try:
                    data = resp.json()
                except Exception as je:
                    print(
                        f"Yandex JSON parse error for user {user.username}: {je}")
                    return

                info = _parse_yandex_now_playing(data)
                if info:
                    await process_func(
                        db, user, info["title"], info["artist"], info["cover"],
                        info["track_url"], "yandex", info["progress"], True,
                        info["duration"], info["album"]
                    )
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
