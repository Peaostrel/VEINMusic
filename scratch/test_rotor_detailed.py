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

def get_url(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read().decode("utf-8"))

print("=== DASHBOARD ===")
dash = get_url("https://api.music.yandex.net/rotor/stations/dashboard")
print(json.dumps(dash, indent=2, ensure_ascii=False)[:1000])

print("\n=== ON YOUR WAVE INFO ===")
info = get_url("https://api.music.yandex.net/rotor/station/user:onyourwave/info")
print(json.dumps(info, indent=2, ensure_ascii=False)[:1000])
