"""Settings the admin panel changes at runtime: the XP multiplier and
feature flags.

Values live in the database so they survive restarts and are the same in
every API/worker process. Each process caches them for CACHE_TTL_SEC, so
a change reaches all processes within that time (immediately in the one
that made it).
"""
from __future__ import annotations

import logging
import time
from datetime import UTC, datetime
from typing import Any, Callable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import FeatureFlag, SystemSetting

logger = logging.getLogger(__name__)

CACHE_TTL_SEC = 30.0
XP_MULTIPLIER_KEY = "xp_multiplier"
DEFAULT_XP_MULTIPLIER = 1.0

# Flags the application checks. A flag that has no row is treated as on.
KNOWN_FEATURES: dict[str, str] = {
    "registration": "Регистрация новых аккаунтов",
    "listen_together": "Комнаты «Слушать вместе»",
    "lastfm_import": "Импорт истории из Last.fm",
    "webhooks": "Создание и отправка вебхуков",
}

_cache: dict[str, tuple[float, Any]] = {}


def invalidate() -> None:
    """Forget cached values (called after the admin changes something)."""
    _cache.clear()


def _cached(name: str, load: Callable[[Session], Any], db: Session | None) -> Any:
    hit = _cache.get(name)
    now = time.monotonic()
    if hit and now - hit[0] < CACHE_TTL_SEC:
        return hit[1]
    if db is not None:
        value = load(db)
    else:
        session = SessionLocal()
        try:
            value = load(session)
        finally:
            session.close()
    _cache[name] = (now, value)
    return value


# --- XP multiplier -----------------------------------------------------------

def _load_multiplier(db: Session) -> float:
    row = db.get(SystemSetting, XP_MULTIPLIER_KEY)
    if row is None:
        return DEFAULT_XP_MULTIPLIER
    try:
        return float(row.value)
    except (TypeError, ValueError):
        logger.warning(f"Invalid XP multiplier {row.value!r}, using {DEFAULT_XP_MULTIPLIER}")
        return DEFAULT_XP_MULTIPLIER


def get_xp_multiplier(db: Session | None = None) -> float:
    return float(_cached("xp_multiplier", _load_multiplier, db))


def set_xp_multiplier(db: Session, value: float) -> float:
    row = db.get(SystemSetting, XP_MULTIPLIER_KEY)
    if row is None:
        row = SystemSetting(key=XP_MULTIPLIER_KEY, value=str(value))
        db.add(row)
    row.value = str(float(value))  # type: ignore[assignment]
    row.updated_at = datetime.now(UTC)  # type: ignore[assignment]
    db.commit()
    invalidate()
    return float(value)


def apply_xp_multiplier(base_xp: int, db: Session | None = None) -> int:
    """XP for a counted play: at least 1, scaled by the multiplier."""
    return max(1, round(base_xp * get_xp_multiplier(db)))


# --- feature flags -----------------------------------------------------------

def _load_flags(db: Session) -> dict[str, bool]:
    return {str(f.key): bool(f.is_enabled) for f in db.query(FeatureFlag).all()}


def feature_flags(db: Session | None = None) -> dict[str, bool]:
    """All flags, with known features that have no row reported as on."""
    flags = dict.fromkeys(KNOWN_FEATURES, True)
    flags.update(_cached("feature_flags", _load_flags, db))
    return flags


def is_feature_enabled(key: str, db: Session | None = None) -> bool:
    return feature_flags(db).get(key, True)


def ensure_feature_enabled(key: str, db: Session | None = None) -> None:
    if not is_feature_enabled(key, db):
        raise HTTPException(503, "Эта функция временно отключена администратором")


def require_feature(key: str) -> Callable[[], None]:
    """FastAPI dependency: 503 while the feature is switched off."""
    def dependency() -> None:
        ensure_feature_enabled(key)
    dependency.__name__ = f"require_feature_{key}"
    return dependency
