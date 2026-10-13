"""Admin panel, "Security": refusal statistics and temporary address blocks."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core.security import get_admin_user
from app.database import get_db
from app.models import IpBlock, User
from app.services import audit, ip_blocks, security_events

router = APIRouter(prefix="/api/admin/security", tags=["admin"])

AdminUser = Annotated[User, Depends(get_admin_user)]
DB = Annotated[Session, Depends(get_db)]


class IpBlockRequest(BaseModel):
    network: str = Field(min_length=2, max_length=64)
    hours: int = Field(ge=1, le=ip_blocks.MAX_DAYS * 24)
    reason: str = Field("", max_length=200)


def _block_dict(block: IpBlock) -> dict:
    return {
        "id": int(block.id),
        "network": block.network,
        "reason": block.reason,
        "created_by": block.created_by,
        "created_at": block.created_at.isoformat() if block.created_at else None,
        "expires_at": block.expires_at.isoformat() if block.expires_at else None,
    }


@router.get("/events")
def security_overview(admin: AdminUser, hours: int = 24):
    """Refusals per hour and the addresses behind most of them this hour."""
    return security_events.summary(max(1, min(hours, 48)))


@router.get("/ip-blocks")
def list_ip_blocks(db: DB, admin: AdminUser):
    return {"items": [_block_dict(b) for b in ip_blocks.active(db)]}


@router.post("/ip-blocks", responses={400: {"description": "Address can't be blocked"}})
def add_ip_block(data: IpBlockRequest, request: Request, db: DB, admin: AdminUser):
    try:
        block = ip_blocks.add(db, data.network, hours=data.hours, reason=data.reason,
                              admin=str(admin.username), admin_ip=get_remote_address(request))
    except ip_blocks.BlockError as exc:
        raise HTTPException(400, str(exc)) from exc
    audit.record(db, admin, "security.ip_block", block.network, hours=data.hours, reason=data.reason)
    db.commit()
    return _block_dict(block)


@router.delete("/ip-blocks/{block_id}", responses={404: {"description": "Block not found"}})
def remove_ip_block(block_id: int, db: DB, admin: AdminUser):
    block = db.get(IpBlock, block_id)
    expires = block.expires_at if block is not None else None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if block is None or expires is None or expires <= datetime.now(UTC):
        raise HTTPException(404, "Блокировка не найдена или уже истекла")
    # Expired now rather than deleted: the history stays readable
    block.expires_at = datetime.now(UTC)  # type: ignore[assignment]
    audit.record(db, admin, "security.ip_unblock", block.network)
    db.commit()
    ip_blocks.invalidate()
    return {"status": "ok"}
