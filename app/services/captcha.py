"""Optional captcha for sign-ups and for logins after failed attempts.

Off until keys are configured, so local runs and tests need nothing:

    CAPTCHA_PROVIDER=yandex      # or "turnstile" (Cloudflare)
    CAPTCHA_SITE_KEY=...         # shown to browsers
    CAPTCHA_SECRET_KEY=...       # server-side check only

Yandex SmartCaptcha works reliably from Russia; Cloudflare Turnstile needs no
cloud billing account. Both are free at this site's scale.
"""
from __future__ import annotations

import logging
import os

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

VERIFY_URLS = {
    "yandex": "https://smartcaptcha.yandexcloud.net/validate",
    "turnstile": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
}
TIMEOUT_SEC = 5


def provider() -> str | None:
    name = os.getenv("CAPTCHA_PROVIDER", "").strip().lower()
    if name in VERIFY_URLS and os.getenv("CAPTCHA_SITE_KEY") and os.getenv("CAPTCHA_SECRET_KEY"):
        return name
    return None


def public_config() -> dict:
    name = provider()
    return {"provider": name, "site_key": os.getenv("CAPTCHA_SITE_KEY") if name else None}


def _passed(name: str, token: str, ip: str | None) -> bool:
    secret = os.getenv("CAPTCHA_SECRET_KEY", "")
    data = {"secret": secret, "token" if name == "yandex" else "response": token}
    if ip:
        data["ip" if name == "yandex" else "remoteip"] = ip
    response = httpx.post(VERIFY_URLS[name], data=data, timeout=TIMEOUT_SEC)
    body = response.json()
    if name == "yandex":
        return response.status_code == 200 and body.get("status") == "ok"
    return bool(body.get("success"))


def verify(token: str | None, ip: str | None) -> None:
    """Raise 403 unless the captcha is off or `token` is a fresh valid answer.

    If the provider can't be reached, the attempt is refused: letting it
    through would switch the protection off exactly when an attacker can
    make the check fail."""
    name = provider()
    if name is None:
        return
    from app.services import security_events
    if not token:
        raise HTTPException(403, {"code": "captcha_required", "message": "Подтвердите, что вы не робот"})
    try:
        ok = _passed(name, token, ip)
    except (httpx.HTTPError, ValueError):
        logger.warning("Captcha provider %s is unreachable", name, exc_info=True)
        raise HTTPException(503, "Не удалось проверить капчу, попробуйте ещё раз") from None
    if not ok:
        security_events.record(security_events.CAPTCHA_FAILED, ip)
        raise HTTPException(403, {"code": "captcha_required", "message": "Капча не пройдена, попробуйте ещё раз"})
