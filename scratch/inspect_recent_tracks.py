import urllib.request
import json
import ssl

token = "y0__xCOpbS9Ahje-AYg6qfX3BYw6OeWkgjxGfYBehZhDhmLwMU01gWzrKOGvA"
uid = "665653902"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    "Authorization": f"OAuth {token}",
    "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
    "User-Agent": "Yandex-Music-API",
}

req = urllib.request.Request("https://api.music.yandex.net/feed", headers=headers)
with urllib.request.urlopen(req, context=ctx) as resp:
    feed = json.loads(resp.read().decode("utf-8"))
    gen_playlists = feed.get("result", {}).get("generatedPlaylists", [])
    print("Generated playlists count:", len(gen_playlists))
    for p in gen_playlists:
        print("Type:", p.get("type"), "| Data keys:", list(p.get("data", {}).keys()))
        data = p.get("data", {})
        title = data.get("title")
        kind = data.get("kind")
        owner = data.get("owner", {}).get("uid")
        tracks_count = data.get("trackCount")
        print(f"  Title: {title} | Kind: {kind} | Owner: {owner} | Count: {tracks_count}")
        if kind and owner:
            # Fetch tracks of this playlist
            p_url = f"https://api.music.yandex.net/users/{owner}/playlists/{kind}"
            try:
                p_req = urllib.request.Request(p_url, headers=headers)
                with urllib.request.urlopen(p_req, context=ctx) as p_resp:
                    p_data = json.loads(p_resp.read().decode("utf-8"))
                    tracks = p_data.get("result", {}).get("tracks", [])
                    print(f"    Fetched {len(tracks)} tracks from {p_url}!")
                    for t in tracks[:5]:
                        tr = t.get("track", {})
                        title = tr.get("title")
                        artists = ", ".join([a.get("name") for a in tr.get("artists", []) if "name" in a])
                        print(f"      - {artists} : {title}")
            except Exception as e:
                print("    Error fetching playlist:", e)
