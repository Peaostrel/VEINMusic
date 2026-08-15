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

# Try queues without device param vs with device param
for device_id in ["", "web", "00000000-0000-0000-0000-000000000000", "default", "android"]:
    url = f"https://api.music.yandex.net/queues" + (f"?device={device_id}" if device_id else "")
    h = dict(headers)
    if device_id:
        h["X-Yandex-Music-Device"] = f"os=Android; os_version=14; manufacturer=Google; model=Pixel; clid=unknown; device_id={device_id}; uuid={device_id}"
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"Device '{device_id}' -> Queues: {data.get('result', {}).get('queues')}")
    except Exception as e:
        print(f"Device '{device_id}' -> Error: {e}")
