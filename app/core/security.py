import bcrypt
import hmac
import hashlib
import time
import os
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Annotated, Optional
from app.models import User
from app.database import get_db

SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-vein-key-change-it-in-production")

def get_password_hash(password: str) -> str: 
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool: 
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_session_token(username: str, hashed_password: str) -> str:
    # Set session lifespan to 30 days
    expires_at = int(time.time()) + 30 * 24 * 3600
    msg = f"{username}:{expires_at}"
    # Bind signature to user password hash so changing password invalidates all sessions
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
        username, expires_at_str, signature = parts
        expires_at = int(expires_at_str)
        
        if time.time() > expires_at:
            return False
            
        msg = f"{username}:{expires_at_str}"
        expected_signature = hmac.new(
            (SECRET_KEY + db_user.hashed_password).encode('utf-8'),
            msg.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature, expected_signature)
    except Exception:
        return False

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    # 1. Try to get token from cookies
    token = request.cookies.get("api_key")
    from_cookie = True
    
    # 2. Fallback for extension or other Bearer auth header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            from_cookie = False
            
    # 3. Fallback to POST/PUT/DELETE JSON body if needed
    if not token and request.method in ["POST", "PUT", "DELETE"]:
        try:
            body = request.state.json_body if hasattr(request.state, "json_body") else {}
            if isinstance(body, dict):
                token = body.get("api_key")
                from_cookie = False
        except AttributeError:
            pass

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = None
    
    # Handle signed session token (contains username and colons)
    if ":" in token:
        try:
            username = token.split(":")[0]
            user = db.query(User).filter(User.username == username).first()
            if not user or not verify_session_token(token, user):
                user = None
        except Exception:
            user = None
    else:
        # Handle raw API key (query by SHA-256 hash to prevent timing attacks and plaintext exposure)
        hashed_token = hashlib.sha256(token.encode('utf-8')).hexdigest()
        user = db.query(User).filter(User.api_key == hashed_token).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid API Key or Session")
        
    # CSRF check on mutating requests authenticated via cookie
    if from_cookie and request.method in ["POST", "PUT", "DELETE"]:
        origin = request.headers.get("Origin")
        referer = request.headers.get("Referer")
        
        # Imports allowed_origins to avoid circular import issues
        from app.main import allowed_origins
        
        if not origin and not referer:
            raise HTTPException(status_code=403, detail="CSRF verification failed: missing Origin/Referer")
            
        origin_allowed = False
        if origin:
            if origin in allowed_origins:
                origin_allowed = True
        elif referer:
            from urllib.parse import urlparse
            ref_parsed = urlparse(referer)
            ref_origin = f"{ref_parsed.scheme}://{ref_parsed.netloc}"
            if ref_origin in allowed_origins:
                origin_allowed = True
                
        if not origin_allowed:
            raise HTTPException(status_code=403, detail="CSRF verification failed: origin not allowed")
            
    return user

def get_admin_user(current_user: Annotated[User, Depends(get_current_user)]):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    return current_user

def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    try:
        from app.main import app
        if get_current_user in app.dependency_overrides:
            override_func = app.dependency_overrides[get_current_user]
            try:
                return override_func()
            except TypeError:
                return override_func(request, db)
    except Exception:
        pass
        
    try:
        return get_current_user(request, db)
    except Exception:
        return None

# Import Optional here
from typing import Optional

