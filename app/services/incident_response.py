"""Operator-only session revocation; changes and audit entry commit together."""
import json
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AdminAuditLog, ApiKey, DeviceAuthorization, User


def revoke_service_sessions(db: Session, *, revoke_api_keys: bool, reason: str) -> dict[str, int]:
    values: dict[Any, Any] = {User.session_version: func.coalesce(User.session_version, 0) + 1}
    if revoke_api_keys:
        values[User.api_key] = None
    users = db.query(User).update(values, synchronize_session=False)
    keys = 0
    pairings = 0
    if revoke_api_keys:
        keys = db.query(ApiKey).filter(ApiKey.is_active.is_(True)).update(
            {ApiKey.is_active: False}, synchronize_session=False)
        pairings = db.query(DeviceAuthorization).filter(DeviceAuthorization.status.in_(("pending", "approved"))).update(
            {DeviceAuthorization.status: "denied"}, synchronize_session=False)
    counts = {"users": users, "api_keys": keys, "pairings": pairings}
    db.add(AdminAuditLog(admin_username="server-console", action="security.revoke_all_sessions",
                         target="all-users", details=json.dumps({**counts, "reason": reason[:500]})))
    db.commit()
    return counts
