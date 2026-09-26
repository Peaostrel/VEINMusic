"""Admin audit log: every change made from the admin panel is recorded
with the admin, the action, its target and a few details."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AdminAuditLog, User

MAX_DETAILS = 2000


def record(db: Session, admin: User, action: str, target: Any = None, **details: Any) -> None:
    """Add an entry to the current transaction (the caller commits, so the
    entry is saved exactly when the change itself is)."""
    payload = json.dumps(details, ensure_ascii=False, default=str) if details else None
    if payload and len(payload) > MAX_DETAILS:
        payload = payload[:MAX_DETAILS - 1] + "…"
    db.add(AdminAuditLog(
        admin_id=admin.id,
        admin_username=str(admin.username)[:64],
        action=action[:64],
        target=None if target is None else str(target)[:128],
        details=payload,
    ))


def list_entries(db: Session, *, action: str | None = None, admin: str | None = None,
                 target: str | None = None, limit: int = 50, offset: int = 0) -> dict[str, Any]:
    query = db.query(AdminAuditLog)
    if action:
        query = query.filter(AdminAuditLog.action == action)
    if admin:
        query = query.filter(AdminAuditLog.admin_username == admin)
    if target:
        query = query.filter(AdminAuditLog.target.ilike(f"%{target}%"))
    total = query.count()
    rows = query.order_by(AdminAuditLog.id.desc()).offset(offset).limit(limit).all()
    actions = [a for (a,) in db.query(AdminAuditLog.action).distinct().order_by(AdminAuditLog.action)]
    return {
        "total": total,
        "actions": actions,
        "items": [{
            "id": r.id,
            "admin": r.admin_username,
            "action": r.action,
            "target": r.target,
            "details": _parse_details(r.details),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows],
    }


def _parse_details(raw: Any) -> Any:
    """Stored JSON; a truncated entry is returned as the raw string."""
    if not raw:
        return None
    try:
        return json.loads(str(raw))
    except ValueError:
        return str(raw)
