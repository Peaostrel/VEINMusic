from datetime import UTC, datetime
import hashlib
import hmac
import os
import time
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "super-secret-vein-key-change-it-in-production")


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8'))


def create_session_token(user_id: str, hashed_password: str) -> str:
    # Set session lifespan to 30 days
    expires_at = int(time.time()) + 30 * 24 * 3600
    msg = f"{user_id}:{expires_at}"
    # Bind signature to user password hash so changing password invalidates
    # all sessions
    signature = hmac.new(
        (SECRET_KEY + hashed_password).encode('utf-8'),
        msg.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return f"{msg}:{signature}"


def verify_session_token(token: str, db_user: User) -> bool:
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return False
        user_id_str, expires_at_str, signature = parts
        expires_at = int(expires_at_str)

        if time.time() > expires_at:
            return False

        msg = f"{user_id_str}:{expires_at_str}"
        expected_signature = hmac.new(
            (SECRET_KEY + db_user.hashed_password).encode('utf-8'),
            msg.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()  # codeql[py/weak-cryptographic-algorithm]

        return hmac.compare_digest(signature, expected_signature)
    except Exception:  # NOSONAR
        return False


def _extract_token(request: Request) -> tuple[str | None, bool]:
    # 1. Try to get token from X-API-Key header
    api_key_header = request.headers.get("X-API-Key")
    if api_key_header:
        return api_key_header.strip(), False

    # 2. Try to get token from cookies
    token = request.cookies.get("api_key")
    if token:
        return token, True

    # 3. Fallback for Bearer auth header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1].strip(), False

    # 4. Fallback to body
    if request.method in ["POST", "PUT", "DELETE"]:
        try:
            body = request.state.json_body if hasattr(
                request.state, "json_body") else {}
            if isinstance(body, dict):
                val = body.get("api_key")
                if val:
                    return str(val).strip(), False
        except AttributeError:
            pass

    return None, False


def hash_developer_key(token: str) -> str:
    """Hash developer API key securely with PBKDF2-HMAC-SHA256."""
    return hashlib.pbkdf2_hmac("sha256", token.encode("utf-8"), SECRET_KEY.encode("utf-8"), 100000).hex()


def _authenticate_user(token: str, db: Session) -> User | None:
    # Check if this is a developer API key (prefix 'vm_')
    if token.startswith("vm_"):
        from app.models import ApiKey
        key_hash = hash_developer_key(token)
        api_key_obj = db.query(ApiKey).filter(
            ApiKey.key_hash == key_hash,
            ApiKey.is_active == True,  # noqa: E712
        ).first()
        if api_key_obj and (not api_key_obj.expires_at or api_key_obj.expires_at > datetime.now(UTC)):
            api_key_obj.last_used_at = datetime.now(UTC)  # type: ignore[assignment]
            db.commit()
            return db.query(User).filter(User.id == api_key_obj.user_id).first()
        return None

    if ":" in token:
        try:
            user_id_str = token.split(":")[0]
            user = db.query(User).filter(User.id == int(user_id_str)).first()
            if user and verify_session_token(token, user):
                return user
        except Exception:  # NOSONAR
            pass
    else:
        hashed_token = hashlib.pbkdf2_hmac('sha256', token.encode('utf-8'), SECRET_KEY.encode(), 100000).hex()
        return db.query(User).filter(User.api_key == hashed_token).first()
    return None


def _check_csrf(request: Request, from_cookie: bool):
    if not from_cookie or request.method not in ["POST", "PUT", "DELETE"]:
        return

    origin = request.headers.get("Origin")
    referer = request.headers.get("Referer")

    from app.main import allowed_origins

    if not origin and not referer:
        raise HTTPException(
            status_code=403,
            detail="CSRF verification failed: missing Origin/Referer")

    origin_allowed = False
    if origin and origin in allowed_origins:
        origin_allowed = True
    elif not origin and referer:
        from urllib.parse import urlparse
        ref_parsed = urlparse(referer)
        ref_origin = f"{ref_parsed.scheme}://{ref_parsed.netloc}"
        if ref_origin in allowed_origins:
            origin_allowed = True

    if not origin_allowed:
        raise HTTPException(
            status_code=403,
            detail="CSRF verification failed: origin not allowed")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token, from_cookie = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = _authenticate_user(token, db)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid API Key or Session")

    _check_csrf(request, from_cookie)
    return user


def get_admin_user(current_user: Annotated[User, Depends(get_current_user)]):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    return current_user


def get_current_user_optional(request: Request,
                              db: Session = Depends(get_db)) -> User | None:
    try:
        from app.main import app
        if get_current_user in app.dependency_overrides:
            override_func = app.dependency_overrides[get_current_user]
            try:
                return override_func()
            except TypeError:
                return override_func(request, db)
    except Exception:  # NOSONAR
        pass

    try:
        return get_current_user(request, db)
    except Exception:  # NOSONAR
        return None


# Import Optional here
