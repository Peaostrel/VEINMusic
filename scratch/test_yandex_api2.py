import urllib.request
import json
import ssl

token = "y0__xCOpbS9Ahje-AYg6qfX3BYw6OeWkgjxGfYBehZhDhmLwMU01gWzrKOGvA"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Test different headers and endpoints
endpoints = [
    ("https://api.music.yandex.net/queues?device=unknown", {"Authorization": f"OAuth {token}"}),
    ("https://api.music.yandex.net/queues", {"Authorization": f"OAuth {token}", "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1", "User-Agent": "Yandex-Music-API"}),
    ("https://api.music.yandex.net/users/665653902/likes/tracks", {"Authorization": f"OAuth {token}"}),
    ("https://api.music.yandex.net/rotor/stations/dashboard", {"Authorization": f"OAuth {token}"}),
]

for url, headers in endpoints:
    print("\nTesting:", url)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            print("Status:", resp.status)
            body = resp.read().decode("utf-8")
            print("Body:", body[:200])
    except urllib.error.HTTPError as e:
        print("HTTP ERR:", e.code, e.read().decode("utf-8", errors="ignore"))
    except Exception as e:
        print("ERR:", e)
