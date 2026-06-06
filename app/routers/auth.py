from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.orm import Session
from typing import Annotated
import secrets
import hashlib
from fastapi.responses import RedirectResponse
import os
import httpx

from app.database import get_db
from app.models import User, UserProfile, UserIntegration
from app.schemas import UserCreate
from app.core.security import get_password_hash, verify_password, get_current_user, create_session_token

router = APIRouter(prefix="/auth", tags=["auth"])

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/auth/spotify/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

@router.post("/register", responses={400: {"description": "Bad Request"}})
def register(data: UserCreate, response: Response, db: Annotated[Session, Depends(get_db)]):
    data.username = data.username.lower()
    if len(data.username) < 3: raise HTTPException(400, "Никнейм слишком короткий")
    if len(data.password) < 6: raise HTTPException(400, "Пароль должен быть не менее 6 символов")
    if db.query(User).filter(User.username == data.username).first(): raise HTTPException(400, "Никнейм занят")
    
    # Generate API Key, compute SHA-256 and store in DB
    raw_api_key = secrets.token_hex(16)
    hashed_api_key = hashlib.sha256(raw_api_key.encode('utf-8')).hexdigest()
    
    new_user = User(username=data.username, hashed_password=get_password_hash(data.password), api_key=hashed_api_key)
    db.add(new_user); db.commit(); db.refresh(new_user)
    
    db.add(UserProfile(user_id=new_user.id))
    db.add(UserIntegration(user_id=new_user.id))
    db.commit()
    
    # Set signed session token in cookie
    session_token = create_session_token(new_user.username, new_user.hashed_password)
    response.set_cookie(
        key="api_key",
        value=session_token,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production", # Set to True in production (HTTPS)
        samesite="strict",
        max_age=30 * 24 * 3600
    )
    return {"message": "Успешная регистрация", "username": new_user.username}

@router.post("/login", responses={400: {"description": "Bad Request"}})
def login(data: UserCreate, response: Response, db: Annotated[Session, Depends(get_db)]):
    data.username = data.username.lower()
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password): raise HTTPException(400, "Неверный логин/пароль")
    
    # Set signed session token in cookie
    session_token = create_session_token(user.username, user.hashed_password)
    response.set_cookie(
        key="api_key",
        value=session_token,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production", # Set to True in production
        samesite="strict",
        max_age=30 * 24 * 3600
    )
    return {"username": user.username}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("api_key")
    return {"message": "Успешный выход"}

@router.get("/spotify/login")
def spotify_login(current_user: Annotated[User, Depends(get_current_user)], response: Response):
    scopes = "user-read-currently-playing user-read-playback-state"
    state = secrets.token_hex(16)
    response.set_cookie(
        key="spotify_auth_state",
        value=state,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production",
        samesite="lax",
        max_age=3600 # 1 hour
    )
    return RedirectResponse(f"https://accounts.spotify.com/authorize?client_id={SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri={SPOTIFY_REDIRECT_URI}&scope={scopes}&state={state}")

@router.get("/spotify/callback")
async def spotify_callback(code: str, state: str, request: Request, response: Response, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    cookie_state = request.cookies.get("spotify_auth_state")
    if not cookie_state or not secrets.compare_digest(state, cookie_state):
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    response.delete_cookie("spotify_auth_state")
    
    user = current_user
    
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://accounts.spotify.com/api/token", data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": SPOTIFY_REDIRECT_URI,
            "client_id": SPOTIFY_CLIENT_ID,
            "client_secret": SPOTIFY_CLIENT_SECRET
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        
        if resp.status_code == 200:
            data = resp.json()
            if not user.integration:
                db.add(UserIntegration(user_id=user.id))
                db.commit()
                db.refresh(user)
            user.integration.spotify_access_token = data["access_token"]
            user.integration.spotify_refresh_token = data["refresh_token"]
            db.commit()
            return RedirectResponse(f"{FRONTEND_URL}/settings?spotify=success")
    return RedirectResponse(f"{FRONTEND_URL}/settings?spotify=error")
