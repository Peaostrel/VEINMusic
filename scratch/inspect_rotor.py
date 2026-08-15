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

# Check rotor station tracks
req = urllib.request.Request("https://api.music.yandex.net/rotor/station/user:onyourwave/tracks", headers=headers)
with urllib.request.urlopen(req, context=ctx) as resp:
    data = json.loads(resp.read().decode("utf-8"))
    seq = data.get("result", {}).get("sequence", [])
    print(f"Rotor sequence count: {len(seq)}")
    for item in seq[:5]:
        tr = item.get("track", {})
        title = tr.get("title")
        artists = ", ".join([a.get("name") for a in tr.get("artists", []) if "name" in a])
        print(f"  Rotor: {artists} - {title}")
