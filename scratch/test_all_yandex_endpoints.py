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

endpoints = [
    "https://api.music.yandex.net/rotor/station/user:onyourwave/tracks",
    "https://api.music.yandex.net/feed",
    "https://api.music.yandex.net/account/experiments",
    "https://api.music.yandex.net/account/settings",
    f"https://api.music.yandex.net/users/{uid}/likes/tracks",
    f"https://api.music.yandex.net/users/{uid}/playlists",
    f"https://api.music.yandex.net/users/{uid}/playlists/list",
    "https://api.music.yandex.net/rotor/stations/dashboard",
]

for url in endpoints:
    print(f"\n====================\nURL: {url}")
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=5.0) as resp:
            print("STATUS:", resp.status)
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            print("DATA:", json.dumps(data, indent=2, ensure_ascii=False)[:400])
    except urllib.error.HTTPError as e:
        print("HTTP ERR:", e.code, e.read().decode("utf-8", errors="ignore")[:200])
    except Exception as e:
        print("ERR:", e)
