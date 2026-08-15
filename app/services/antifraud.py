from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Scrobble, User


def _check_hourly_velocity(user_id: int, db: Session, one_hour_ago: datetime) -> tuple[int, list[str]]:
    reasons = []
    risk = 0
    hourly_count = (
        db.query(func.count(Scrobble.id))
        .filter(Scrobble.user_id == user_id, Scrobble.played_at >= one_hour_ago)
        .scalar()
        or 0
    )
    if hourly_count > 70:
        reasons.append(f"Аномальная скорость: {hourly_count} скробблов за последний час (макс. норма 60)")
        risk += 45
    elif hourly_count > 50:
        risk += 20
    return risk, reasons


def _check_daily_velocity(user_id: int, db: Session, one_day_ago: datetime) -> tuple[int, list[str]]:
    reasons = []
    risk = 0
    daily_count = (
        db.query(func.count(Scrobble.id))
        .filter(Scrobble.user_id == user_id, Scrobble.played_at >= one_day_ago)
        .scalar()
        or 0
    )
    if daily_count > 700:
        reasons.append(f"Превышение суточного лимита: {daily_count} скробблов за 24 часа")
        risk += 35
    return risk, reasons


def _check_micro_tracks(user_id: int, db: Session) -> tuple[int, list[str]]:
    reasons = []
    risk = 0
    recent = (
        db.query(Scrobble)
        .filter(Scrobble.user_id == user_id)
        .order_by(Scrobble.id.desc())
        .limit(40)
        .all()
    )
    if len(recent) >= 20:
        micro_tracks = [s for s in recent if (s.listened_sec or 0) < 20 and (s.xp_earned or 0) > 0]
        if len(micro_tracks) / len(recent) > 0.6:
            reasons.append(f"Накрутка короткими треками: {len(micro_tracks)} из {len(recent)} треков короче 20 сек")
            risk += 40
    return risk, reasons


def scan_user_antifraud(user: User, db: Session) -> tuple[bool, int, list[str]]:
    """Scan a single user for potential scrobble farming or XP botting patterns."""
    now = datetime.now(UTC)
    one_hour_ago = now - timedelta(hours=1)
    one_day_ago = now - timedelta(days=1)
    u_id = int(user.id)

    r1, reasons1 = _check_hourly_velocity(u_id, db, one_hour_ago)
    r2, reasons2 = _check_daily_velocity(u_id, db, one_day_ago)
    r3, reasons3 = _check_micro_tracks(u_id, db)

    total_risk = r1 + r2 + r3
    all_reasons = reasons1 + reasons2 + reasons3
    is_suspicious = total_risk >= 40
    return is_suspicious, min(100, total_risk), all_reasons


def _build_suspicious_record(u: User, score: int, reasons: list[str], db: Session) -> dict[str, Any]:
    scrobbles_total = db.query(func.count(Scrobble.id)).filter(Scrobble.user_id == u.id).scalar() or 0
    xp_total = (
        db.query(func.sum(Scrobble.xp_earned)).filter(Scrobble.user_id == u.id).scalar() or 0
    ) + (u.integration.bonus_xp or 0 if u.integration else 0)

    return {
        "user_id": u.id,
        "username": u.username,
        "display_name": u.profile.display_name if u.profile else None,
        "avatar_url": u.profile.avatar_url if u.profile else None,
        "risk_score": score,
        "is_banned": bool(u.is_banned),
        "is_flagged": bool(u.is_flagged_antifraud),
        "antifraud_reason": u.antifraud_reason or ("; ".join(reasons) if reasons else "Флаг администратора"),
        "reasons": reasons,
        "total_scrobbles": scrobbles_total,
        "total_xp": xp_total,
    }


def get_all_suspicious_users(db: Session) -> list[dict[str, Any]]:
    """Scan all active users and return those flagged with potential fraud."""
    users = db.query(User).all()
    results = []
    for u in users:
        is_suspicious, score, reasons = scan_user_antifraud(u, db)
        if is_suspicious or u.is_flagged_antifraud:
            results.append(_build_suspicious_record(u, score, reasons, db))

    results.sort(key=lambda x: x["risk_score"], reverse=True)
    return results
