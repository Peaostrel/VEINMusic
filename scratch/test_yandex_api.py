import urllib.request
import json
import ssl

token = "y0__xCOpbS9Ahje-AYg6qfX3BYw6OeWkgjxGfYBehZhDhmLwMU01gWzrKOGvA"
headers = {
    "Authorization": f"OAuth {token}",
    "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
    "User-Agent": "Yandex-Music-API",
}

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.Request("https://api.music.yandex.net/account/status", headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx) as resp:
        print("ACCOUNT STATUS:", resp.status)
        print(resp.read().decode("utf-8")[:300])
except Exception as e:
    print("ACCOUNT ERR:", e)

req2 = urllib.request.Request("https://api.music.yandex.net/queues", headers=headers)
try:
    with urllib.request.urlopen(req2, context=ctx) as resp:
        print("\nQUEUES STATUS:", resp.status)
        data = json.loads(resp.read().decode("utf-8"))
        print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print("QUEUES ERR:", e)
