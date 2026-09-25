"""Device pairing (OAuth 2.0 device-authorization style) for the browser extension.

1. The extension calls POST /api/devices/code and shows the short user code.
2. The user opens /link on the website and approves the code while signed in.
3. The extension polls POST /api/devices/token and receives its own API key
   (scopes scrobble:write + profile:read), which is listed and revocable in the
   developer settings like any other key.
"""
from __future__ import annotations

import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import get_current_user, hash_developer_key
from app.database import get_db
from app.models import ApiKey, DeviceAuthorization, User

router = APIRouter(prefix="/api/devices", tags=["devices"])

CODE_TTL = timedelta(minutes=10)
POLL_INTERVAL_SEC = 5
EXTENSION_SCOPES = "scrobble:write,profile:read"
# No 0/O/1/I to avoid confusion when typing the code
_USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class DeviceCodeRequest(BaseModel):
    client_name: str = Field("VEIN Music Extension", max_length=64)


class DeviceTokenRequest(BaseModel):
    device_code: str = Field(..., max_length=128)


class DeviceApproveRequest(BaseModel):
    user_code: str = Field(..., max_length=16)
    approve: bool = True


def _hash_device_code(device_code: str) -> str:
    return hashlib.sha256(device_code.encode("utf-8")).hexdigest()


def _normalize_user_code(code: str) -> str:
    code = "".join(ch for ch in code.upper() if ch.isalnum())
    return f"{code[:4]}-{code[4:]}" if len(code) == 8 else code


def _new_user_code() -> str:
    raw = "".join(secrets.choice(_USER_CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def _as_aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _is_expired(auth: DeviceAuthorization) -> bool:
    return _as_aware(auth.expires_at) <= datetime.now(UTC)  # type: ignore[arg-type]


@router.post("/code")
@limiter.limit("10/minute")
def create_device_code(request: Request, payload: DeviceCodeRequest,
                       db: Annotated[Session, Depends(get_db)]):
    """Start pairing: returns a secret device code and a short user code."""
    device_code = secrets.token_urlsafe(32)
    for _ in range(5):
        auth = DeviceAuthorization(
            device_code_hash=_hash_device_code(device_code),
            user_code=_new_user_code(),
            client_name=payload.client_name.strip() or "VEIN Music Extension",
            status="pending",
            expires_at=datetime.now(UTC) + CODE_TTL,
        )
        db.add(auth)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()  # user code collision: try another one
    else:
        raise HTTPException(503, "Не удалось создать код, попробуйте ещё раз")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return {
        "device_code": device_code,
        "user_code": auth.user_code,
        "verification_uri": f"{frontend_url}/link",
        "verification_uri_complete": f"{frontend_url}/link?code={auth.user_code}",
        "expires_in": int(CODE_TTL.total_seconds()),
        "interval": POLL_INTERVAL_SEC,
    }


@router.post("/token")
@limiter.limit("30/minute")
def poll_device_token(request: Request, payload: DeviceTokenRequest,
                      db: Annotated[Session, Depends(get_db)]):
    """Polled by the device. Issues the API key once the user approved."""
    auth = db.query(DeviceAuthorization).filter(
        DeviceAuthorization.device_code_hash == _hash_device_code(payload.device_code)).first()
    if not auth or auth.status == "consumed":
        return {"status": "invalid"}
    if auth.status == "denied":
        return {"status": "denied"}
    if _is_expired(auth):
        return {"status": "expired"}
    if auth.status != "approved" or auth.user_id is None:
        return {"status": "pending", "interval": POLL_INTERVAL_SEC}

    user = db.query(User).filter(User.id == auth.user_id).first()
    if not user or user.is_banned:
        return {"status": "denied"}

    raw_secret = secrets.token_urlsafe(32)
    full_key = f"vm_{raw_secret}"
    db.add(ApiKey(
        user_id=user.id,
        key_hash=hash_developer_key(full_key),
        prefix=f"vm_{raw_secret[:6]}",
        name=f"Устройство: {auth.client_name}"[:64],
        scopes=EXTENSION_SCOPES,
        is_active=True,
    ))
    auth.status = "consumed"  # type: ignore[assignment]
    db.commit()
    return {"status": "approved", "api_key": full_key, "username": user.username}


@router.get("/code/{user_code}", responses={404: {"description": "Unknown or expired code"}})
def get_device_code(user_code: str,
                    db: Annotated[Session, Depends(get_db)],
                    current_user: Annotated[User, Depends(get_current_user)]):
    """Details shown on the confirmation page before approving."""
    auth = db.query(DeviceAuthorization).filter(
        DeviceAuthorization.user_code == _normalize_user_code(user_code)).first()
    if not auth or auth.status != "pending" or _is_expired(auth):
        raise HTTPException(404, "Код не найден или устарел")
    return {"user_code": auth.user_code, "client_name": auth.client_name,
            "expires_at": _as_aware(auth.expires_at).isoformat()}  # type: ignore[arg-type]


@router.post("/approve", responses={404: {"description": "Unknown or expired code"}})
def approve_device(payload: DeviceApproveRequest,
                   db: Annotated[Session, Depends(get_db)],
                   current_user: Annotated[User, Depends(get_current_user)]):
    auth = db.query(DeviceAuthorization).filter(
        DeviceAuthorization.user_code == _normalize_user_code(payload.user_code)).first()
    if not auth or auth.status != "pending" or _is_expired(auth):
        raise HTTPException(404, "Код не найден или устарел")
    auth.user_id = current_user.id
    auth.status = "approved" if payload.approve else "denied"  # type: ignore[assignment]
    db.commit()
    return {"status": auth.status}
