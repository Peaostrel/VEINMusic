import urllib.request
import json
import ssl

token = "y0__xCOpbS9Ahje-AYg6qfX3BYw6OeWkgjxGfYBehZhDhmLwMU01gWzrKOGvA"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    "Authorization": f"OAuth {token}",
    "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
    "User-Agent": "Yandex-Music-API",
}

async def fetch_feed_recent():
    req = urllib.request.Request("https://api.music.yandex.net/feed", headers=headers)
    with urllib.request.urlopen(req, context=ctx) as resp:
        feed = json.loads(resp.read().decode("utf-8"))
        gen_playlists = feed.get("result", {}).get("generatedPlaylists", [])
        for p in gen_playlists:
            if p.get("type") == "recentTracks":
                data = p.get("data", {})
                kind = data.get("kind")
                owner = data.get("owner", {}).get("uid")
                if kind and owner:
                    p_url = f"https://api.music.yandex.net/users/{owner}/playlists/{kind}"
                    p_req = urllib.request.Request(p_url, headers=headers)
                    with urllib.request.urlopen(p_req, context=ctx) as p_resp:
                        p_data = json.loads(p_resp.read().decode("utf-8"))
                        tracks = p_data.get("result", {}).get("tracks", [])
                        if tracks:
                            latest = tracks[0].get("track", {})
                            print("LATEST RECENT TRACK:")
                            print(" Title:", latest.get("title"))
                            print(" Artists:", [a.get("name") for a in latest.get("artists", [])])
                            print(" Cover:", latest.get("coverUri"))
                            print(" DurationMs:", latest.get("durationMs"))

import asyncio
asyncio.run(fetch_feed_recent())
