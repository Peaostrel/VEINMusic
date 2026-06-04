import bcrypt
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from app.models import User
from app.database import get_db

def get_password_hash(password: str) -> str: 
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool: 
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    # 1. Try to get API key from cookies (HttpOnly)
    api_key = request.cookies.get("api_key")
    
    # 2. Fallback for the extension: look in Authorization header or body
    if not api_key:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            api_key = auth_header.split(" ")[1]
            
    if not api_key and request.method in ["POST", "PUT", "DELETE"]:
        try:
            body = request.state.json_body if hasattr(request.state, "json_body") else {}
            api_key = body.get("api_key")
        except Exception:
            pass



    if not api_key:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.api_key == api_key).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid API Key")
        
    return user
