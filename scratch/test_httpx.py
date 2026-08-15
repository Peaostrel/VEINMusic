import httpx

try:
    with httpx.Client(trust_env=False, timeout=4.0) as client:
        r = client.get("http://localhost:8000/api/public-stats")
        print("Success:", r.status_code, r.json())
except Exception as e:
    print("Error:", e)
