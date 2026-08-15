import asyncio
import httpx
from app.database import SessionLocal
from app.models import User
from app.services.scrobble_processor import process_scrobble

async def test_cloud():
    db = SessionLocal()
    user = db.query(User).filter(User.username == "peaostrel").first()
    if not user:
        print("User peaostrel not found")
        return

    headers = {
        "Authorization": f"OAuth {user.integration.yandex_token}",
        "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
        "User-Agent": "Yandex-Music-API",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get("https://api.music.yandex.net/feed", headers=headers, timeout=5.0)
        if resp.status_code == 200:
            feed = resp.json()
            for p in feed.get("result", {}).get("generatedPlaylists", []):
                if p.get("type") == "recentTracks":
                    data = p.get("data", {})
                    kind = data.get("kind")
                    owner = data.get("owner", {}).get("uid")
                    if kind and owner:
                        p_resp = await client.get(f"https://api.music.yandex.net/users/{owner}/playlists/{kind}", headers=headers, timeout=5.0)
                        if p_resp.status_code == 200:
                            tracks = p_resp.json().get("result", {}).get("tracks", [])
                            print(f"Found {len(tracks)} recent tracks from Yandex Feed!")
                            for item in tracks[:3]:
                                t = item.get("track", {})
                                title = t.get("title")
                                artist = ", ".join([a.get("name") for a in t.get("artists", []) if "name" in a]) or "Unknown Artist"
                                albums = t.get("albums", [])
                                album = albums[0].get("title") if albums else ""
                                cover_uri = t.get("coverUri") or (albums[0].get("coverUri") if albums else None)
                                cover = ("https://" + cover_uri.replace("%%", "400x400")) if cover_uri else None
                                duration = int(t.get("durationMs", 0) / 1000)
                                track_url = f"https://music.yandex.ru/track/{t.get('id')}"
                                
                                print(f"Processing cloud track: {artist} - {title}")
                                res = await process_scrobble(
                                    db, user, title, artist, cover or "",
                                    track_url, "yandex", duration, False, duration, album
                                )
                                print(" Scrobble result:", res)
    db.close()

asyncio.run(test_cloud())
