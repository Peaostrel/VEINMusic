import urllib.request
import json
import ssl

token = "y0__xCOpbS9Ahje-AYg6qfX3BYw6OeWkgjxGfYBehZhDhmLwMU01gWzrKOGvA"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def test_endpoint(url, headers_extra=None):
    headers = {
        "Authorization": f"OAuth {token}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Yandex-Music-Client": "YandexMusicWeb/1.0.0"
    }
    if headers_extra:
        headers.update(headers_extra)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"[200] {url}")
            return data
    except urllib.error.HTTPError as e:
        print(f"[{e.code}] {url} -> {e.read().decode('utf-8', errors='ignore')[:120]}")
    except Exception as e:
        print(f"[ERR] {url} -> {e}")
    return None

print("=== EXPLORING YANDEX API ===")
status = test_endpoint("https://api.music.yandex.net/account/status")
if status:
    print("UID:", status.get("result", {}).get("account", {}).get("uid"))
    print("Account keys:", list(status.get("result", {}).get("account", {}).keys()))

# Check web handlers
test_endpoint("https://music.yandex.ru/handlers/main.jsx")
test_endpoint("https://music.yandex.ru/handlers/radio.jsx")
test_endpoint("https://music.yandex.ru/handlers/rotor-station.jsx")

# Check API endpoints
test_endpoint("https://api.music.yandex.net/rotor/stations/dashboard")
test_endpoint("https://api.music.yandex.net/rotor/station/user:onyourwave/tracks")
test_endpoint("https://api.music.yandex.net/rotor/station/user:onyourwave/info")

# Check plays/history
test_endpoint("https://api.music.yandex.net/landing3?blocks=personal-playlists,history,promotions")
test_endpoint("https://api.music.yandex.net/users/665653902/playlists/list")
