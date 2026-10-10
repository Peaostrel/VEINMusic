"""Encrypted TOTP enrollment and atomic, replay-resistant verification."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import time

import pyotp
from sqlalchemy.orm import Session

from app.models import User


def admin_mfa_required() -> bool:
    default = "1" if os.getenv("ENVIRONMENT") == "production" else "0"
    return os.getenv("ADMIN_REQUIRE_2FA", default) == "1"


def _code_hash(code: str) -> str:
    return hashlib.sha256(code.replace("-", "").strip().lower().encode()).hexdigest()


def new_recovery_codes() -> tuple[list[str], str]:
    codes = [secrets.token_hex(16) for _ in range(8)]
    return codes, json.dumps([_code_hash(code) for code in codes])


def consume_code(db: Session, user: User, code: str, *, pending: bool = False) -> bool:
    if not user.totp_secret or (not pending and not user.totp_enabled):
        return False
    value = code.strip().replace(" ", "")
    if len(value) == 6 and value.isascii() and value.isdigit():
        return _consume_totp(db, user, value, pending=pending)
    if pending:
        return False
    stored = str(user.totp_recovery_codes or "[]")
    hashes = json.loads(stored)
    matched = next((h for h in hashes if secrets.compare_digest(h, _code_hash(value))), None)
    if matched is None:
        return False
    hashes.remove(matched)
    return db.query(User).filter(
        User.id == user.id, User.totp_enabled.is_(True),
        User.session_version == user.session_version, User.totp_recovery_codes == stored,
    ).update({User.totp_recovery_codes: json.dumps(hashes)}, synchronize_session="fetch") == 1


def _consume_totp(db: Session, user: User, code: str, *, pending: bool) -> bool:
    current_step = int(time.time()) // 30
    otp = pyotp.TOTP(str(user.totp_secret))
    matched = next((step for step in (current_step, current_step - 1, current_step + 1)
                    if secrets.compare_digest(otp.at(step * 30), code)), None)
    if matched is None:
        return False
    query = db.query(User).filter(
        User.id == user.id, User.session_version == user.session_version,
        User.totp_enabled.is_(not pending), User.totp_last_step < matched)
    if pending:
        query = query.filter(User.totp_setup_expires_at == user.totp_setup_expires_at)
    return query.update({User.totp_last_step: matched}, synchronize_session="fetch") == 1
