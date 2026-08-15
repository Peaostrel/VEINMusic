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
    "User-Agent": "Yandex-Music-API",
}

endpoints = [
    f"https://api.music.yandex.net/users/{uid}/history",
    f"https://api.music.yandex.net/users/{uid}/history/tracks",
    f"https://api.music.yandex.net/users/{uid}/feed",
    "https://api.music.yandex.net/feed",
    "https://api.music.yandex.net/landing3?blocks=personal-playlists,history",
    f"https://api.music.yandex.net/users/{uid}/playlists/list",
]

for url in endpoints:
    print(f"\n--- Checking: {url} ---")
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            print("Status:", resp.status)
            data = json.loads(resp.read().decode("utf-8"))
            print("Data keys:", list(data.keys()))
            if "result" in data:
                res = data["result"]
                if isinstance(res, dict):
                    print("Result keys:", list(res.keys()))
                    # Look for tracks
                    for k in ["tracks", "items", "history", "days", "events", "playlists"]:
                        if k in res:
                            val = res[k]
                            print(f"  Found '{k}': {type(val)} (len: {len(val) if isinstance(val, list) else 'N/A'})")
                            if isinstance(val, list) and len(val) > 0:
                                print(f"    Sample item: {json.dumps(val[0], ensure_ascii=False)[:200]}")
                elif isinstance(res, list):
                    print(f"Result is list of {len(res)} items")
                    if len(res) > 0:
                        print("Sample item:", json.dumps(res[0], ensure_ascii=False)[:200])
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode('utf-8', errors='ignore')[:150]}")
    except Exception as e:
        print("Error:", e)
