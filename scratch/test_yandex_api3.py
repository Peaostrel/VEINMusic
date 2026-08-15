import urllib.request
import json
import ssl

token = "y0__xCOpbS9Ahje-AYg6qfX3BYw6OeWkgjxGfYBehZhDhmLwMU01gWzrKOGvA"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

device_id = "00000000-0000-0000-0000-000000000000"
headers = {
    "Authorization": f"OAuth {token}",
    "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
    "User-Agent": "Yandex-Music-API",
    "X-Yandex-Music-Device": f"os=Android; os_version=14; manufacturer=Google; model=Pixel 8; clid=unknown; device_id={device_id}; uuid={device_id}",
}

req = urllib.request.Request(f"https://api.music.yandex.net/queues?device={device_id}", headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx) as resp:
        print("QUEUES STATUS:", resp.status)
        data = json.loads(resp.read().decode("utf-8"))
        print("Queues data:", json.dumps(data, indent=2, ensure_ascii=False))
except urllib.error.HTTPError as e:
    print("HTTP ERR:", e.code, e.read().decode("utf-8", errors="ignore"))
except Exception as e:
    print("ERR:", e)
