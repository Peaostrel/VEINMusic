"""Password-confirmed two-factor enrollment and recovery."""
import os
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.rate_limit import credential_key, limiter
from app.core.security import get_current_user, revoke_all_sessions, verify_password
from app.database import get_db
from app.models import User
from app.services import audit
from app.services.sessions import issue_session
from app.services.mfa import admin_mfa_required, consume_code, new_recovery_codes

router = APIRouter(prefix="/auth/2fa", tags=["auth"])
DB = Annotated[Session, Depends(get_db)]
Owner = Annotated[User, Depends(get_current_user)]
RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"description": "Invalid password or code"},
    403: {"description": "Required for administrator"},
    409: {"description": "Already enabled"},
}


class PasswordConfirmation(BaseModel):
    password: str = Field(..., max_length=128)


class CodeConfirmation(BaseModel):
    code: str = Field(..., min_length=6, max_length=64)


class DisableConfirmation(PasswordConfirmation, CodeConfirmation):
    pass


def _check_password(data: PasswordConfirmation, user: User) -> None:
    if not verify_password(data.password, str(user.hashed_password)):
        raise HTTPException(400, "Неверный пароль")


def _refresh_session(response: Response, user: User, db: Session, request: Request) -> None:
    response.headers["Cache-Control"] = "no-store"
    token = issue_session(db, user, request, notify=False)
    response.set_cookie("api_key", token,
                        httponly=True, secure=os.getenv("ENVIRONMENT") == "production",
                        samesite="strict", max_age=30 * 24 * 3600)


@router.get("/status")
def status(response: Response, user: Owner):
    response.headers["Cache-Control"] = "no-store"
    return {"enabled": bool(user.totp_enabled),
            "required": user.role == "admin" and admin_mfa_required()}


@router.post("/setup", responses=RESPONSES)
@limiter.limit("3/minute", key_func=credential_key)
def setup(request: Request, response: Response, data: PasswordConfirmation, db: DB, user: Owner):
    _check_password(data, user)
    if user.totp_enabled:
        raise HTTPException(409, "Двухфакторная защита уже включена")
    secret = pyotp.random_base32()
    user.totp_secret = secret  # type: ignore[assignment]
    user.totp_last_step = -1  # type: ignore[assignment]
    user.totp_setup_expires_at = datetime.now(UTC) + timedelta(minutes=10)  # type: ignore[assignment]
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return {"secret": secret, "uri": pyotp.TOTP(secret).provisioning_uri(str(user.username), issuer_name="VEINMusic")}


@router.post("/enable", responses=RESPONSES)
@limiter.limit("5/minute", key_func=credential_key)
def enable(request: Request, response: Response, data: CodeConfirmation, db: DB, user: Owner):
    expiry = user.totp_setup_expires_at
    if expiry is not None and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)
    if user.totp_enabled or not expiry or expiry <= datetime.now(UTC):
        raise HTTPException(400, "Сначала начните настройку двухфакторной защиты")
    if not consume_code(db, user, data.code, pending=True):
        raise HTTPException(400, "Неверный или уже использованный код")
    codes, hashes = new_recovery_codes()
    user.totp_enabled = True  # type: ignore[assignment]
    user.totp_recovery_codes = hashes  # type: ignore[assignment]
    user.totp_setup_expires_at = None  # type: ignore[assignment]
    revoke_all_sessions(user)
    audit.record(db, user, "security.2fa_enabled", user.username)
    db.commit()
    _refresh_session(response, user, db, request)
    return {"enabled": True, "recovery_codes": codes}


@router.post("/disable", responses=RESPONSES)
@limiter.limit("5/minute", key_func=credential_key)
def disable(request: Request, response: Response, data: DisableConfirmation, db: DB, user: Owner):
    _check_password(data, user)
    if user.role == "admin" and admin_mfa_required():
        raise HTTPException(403, "Двухфакторная защита обязательна для администратора")
    if not consume_code(db, user, data.code):
        raise HTTPException(400, "Неверный или уже использованный код")
    user.totp_enabled = False  # type: ignore[assignment]
    user.totp_secret = None  # type: ignore[assignment]
    user.totp_recovery_codes = None  # type: ignore[assignment]
    user.totp_last_step = -1  # type: ignore[assignment]
    revoke_all_sessions(user)
    audit.record(db, user, "security.2fa_disabled", user.username)
    db.commit()
    _refresh_session(response, user, db, request)
    return {"enabled": False}
