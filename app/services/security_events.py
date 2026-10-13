"""Counts of security-relevant refusals, so an attack shows up in the admin
panel instead of only in the logs.

Per hour and kind, plus the addresses that caused the most refusals in the
current hour (kept for a day, then dropped). When a kind crosses its alert
threshold within an hour, every administrator gets a notification once.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import Counter, defaultdict

logger = logging.getLogger(__name__)

LOGIN_FAILED = "login_failed"
BAD_API_KEY = "bad_api_key"
RATE_LIMITED = "rate_limited"
IP_BLOCKED = "ip_blocked"
CAPTCHA_FAILED = "captcha_failed"

LABELS = {
    LOGIN_FAILED: "Неудачные входы",
    BAD_API_KEY: "Неверные API-ключи",
    RATE_LIMITED: "Превышен лимит запросов",
    IP_BLOCKED: "Запросы с заблокированных адресов",
    CAPTCHA_FAILED: "Не пройдена капча",
}
# Events per hour after which administrators are told
ALERT_THRESHOLDS = {
    LOGIN_FAILED: 100,
    BAD_API_KEY: 200,
    RATE_LIMITED: 20,
    CAPTCHA_FAILED: 100,
}
KEEP_SEC = 26 * 3600
TOP_ADDRESSES = 10

_local_counts: dict[int, Counter[str]] = defaultdict(Counter)
_local_ips: dict[int, Counter[str]] = defaultdict(Counter)
_lock = threading.Lock()


def _hour(now: float | None = None) -> int:
    return int(now if now is not None else time.time()) // 3600


def _redis():
    from app.services.cache import redis_client
    return redis_client


def _count(kind: str, ip: str | None, hour: int) -> int:
    client = _redis()
    if client is not None:
        try:
            pipe = client.pipeline()
            pipe.hincrby(f"secev:{hour}", kind, 1)
            pipe.expire(f"secev:{hour}", KEEP_SEC)
            if ip:
                pipe.zincrby(f"secip:{hour}", 1, ip)
                pipe.expire(f"secip:{hour}", KEEP_SEC)
            return int(pipe.execute()[0])
        except Exception:  # fall back to counting in this process
            pass
    with _lock:
        for old in [h for h in _local_counts if h < hour - 26]:
            _local_counts.pop(old, None)
            _local_ips.pop(old, None)
        _local_counts[hour][kind] += 1
        if ip:
            ips = _local_ips[hour]
            if len(ips) < 10_000 or ip in ips:
                ips[ip] += 1
        return _local_counts[hour][kind]


def record(kind: str, ip: str | None = None) -> None:
    """Count one refusal; never raises."""
    try:
        hour = _hour()
        count = _count(kind, ip, hour)
        if count == ALERT_THRESHOLDS.get(kind):
            _alert_admins(kind, count)
    except Exception:
        logger.warning("Could not record security event %s", kind, exc_info=True)


def _alert_admins(kind: str, count: int) -> None:
    from app.database import SessionLocal
    from app.models import User
    from app.services import notifications

    logger.warning("Security alert: %s reached %s within an hour", kind, count)
    db = SessionLocal()
    try:
        admins = db.query(User).filter(User.role == "admin", User.is_banned.isnot(True)).all()
        for admin in admins:
            notifications.create(
                db, recipient_id=int(admin.id), actor_id=int(admin.id), kind=notifications.KIND_SECURITY,
                message=(f"Похоже на атаку: «{LABELS[kind]}» — уже {count} за час. "
                         "Подробности и блокировка адресов — в админке, раздел «Безопасность»."))
        db.commit()
    finally:
        db.close()


def summary(hours: int = 24) -> dict:
    """Per-hour counts for the last `hours` hours and this hour's top addresses."""
    now_hour = _hour()
    series = []
    client = _redis()
    for hour in range(now_hour - hours + 1, now_hour + 1):
        counts: dict[str, int] = {}
        if client is not None:
            try:
                counts = {k: int(v) for k, v in (client.hgetall(f"secev:{hour}") or {}).items()}
            except Exception:
                counts = {}
        if not counts:
            with _lock:
                counts = dict(_local_counts.get(hour, {}))
        series.append({"hour": hour * 3600, **{kind: counts.get(kind, 0) for kind in LABELS}})
    top: list[tuple[str, int]] = []
    if client is not None:
        try:
            top = [(str(ip), int(score)) for ip, score in
                   client.zrevrange(f"secip:{now_hour}", 0, TOP_ADDRESSES - 1, withscores=True)]
        except Exception:
            top = []
    if not top:
        with _lock:
            top = _local_ips.get(now_hour, Counter()).most_common(TOP_ADDRESSES)
    return {
        "labels": LABELS,
        "thresholds": ALERT_THRESHOLDS,
        "series": series,
        "top_addresses": [{"ip": ip, "events": count} for ip, count in top],
    }


def reset() -> None:
    """Tests: forget the counts kept in this process."""
    with _lock:
        _local_counts.clear()
        _local_ips.clear()
