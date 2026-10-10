"""Independent monitor process: can alert when the API or worker has stopped."""
import asyncio
import logging
import os
import time
import httpx

from app.services.operational_monitor import snapshot

logger = logging.getLogger(__name__)


def api_healthy():
    try:
        response = httpx.get(os.getenv("MONITOR_API_URL", "http://backend:8000/health"), timeout=8)
        return response.status_code == 200 and response.json().get("status") == "ok"
    except (httpx.HTTPError, ValueError):
        return False


def notify(messages):
    """Optional operator-configured HTTPS destination. Never echo the secret URL."""
    endpoint = os.getenv("MONITOR_WEBHOOK_URL", "")
    if not endpoint:
        logger.warning("Monitoring alert (delivery not configured): %s", "; ".join(messages))
        return True
    if not endpoint.startswith("https://"):
        logger.error("Monitor destination must use HTTPS")
        return False
    try:
        response = httpx.post(endpoint, json={"text": "VEINMusic: " + "; ".join(messages)}, timeout=8)
        return 200 <= response.status_code < 300
    except httpx.HTTPError:
        logger.warning("Monitor alert delivery failed")
        return False


async def run():
    logging.basicConfig(level=logging.INFO)
    # Suppress startup noise while migrations, polling and the first dump start.
    await asyncio.sleep(180)
    delivered: dict[str, float] = {}
    while True:
        alerts = (await snapshot())["alerts"]
        if not await asyncio.to_thread(api_healthy):
            alerts.append({"code": "api", "message": "API недоступен"})
        current = {item["code"]: item["message"] for item in alerts}
        due = [message for code, message in current.items() if time.monotonic() - delivered.get(code, -86400) > 3600]
        recovered = [code for code in delivered if code not in current]
        messages = due + [f"Восстановлено: {code}" for code in recovered]
        if messages and await asyncio.to_thread(notify, messages):
            for code in recovered:
                delivered.pop(code, None)
            for code in current:
                if time.monotonic() - delivered.get(code, -86400) > 3600:
                    delivered[code] = time.monotonic()
        await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(run())
