from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.orm import Session
import secrets
from fastapi.responses import RedirectResponse
import os
import httpx

from app.database import get_db
from app.models import User, UserProfile, UserIntegration
from app.schemas import UserCreate
from app.core.security import get_password_hash, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/auth/spotify/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

@router.post("/register")
def register(data: UserCreate, response: Response, db: Session = Depends(get_db)):
    data.username = data.username.lower()
    if len(data.username) < 3: raise HTTPException(400, "Никнейм слишком короткий")
    if len(data.password) < 6: raise HTTPException(400, "Пароль должен быть не менее 6 символов")
    if db.query(User).filter(User.username == data.username).first(): raise HTTPException(400, "Никнейм занят")
    new_user = User(username=data.username, hashed_password=get_password_hash(data.password), api_key=secrets.token_hex(16))
    db.add(new_user); db.commit(); db.refresh(new_user)
    
    db.add(UserProfile(user_id=new_user.id))
    db.add(UserIntegration(user_id=new_user.id))
    db.commit()
    
    # Set HttpOnly cookie
    response.set_cookie(
        key="api_key",
        value=new_user.api_key,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production", # Set to True in production (HTTPS)
        samesite="lax",
        max_age=30 * 24 * 3600
    )
    return {"message": "Успешная регистрация", "username": new_user.username, "api_key": new_user.api_key}

@router.post("/login")
def login(data: UserCreate, response: Response, db: Session = Depends(get_db)):
    data.username = data.username.lower()
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password): raise HTTPException(400, "Неверный логин/пароль")
    
    # Set HttpOnly cookie
    response.set_cookie(
        key="api_key",
        value=user.api_key,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production", # Set to True in production
        samesite="lax",
        max_age=30 * 24 * 3600
    )
    return {"username": user.username, "api_key": user.api_key}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("api_key")
    return {"message": "Успешный выход"}

@router.get("/spotify/login")
def spotify_login(api_key: str):
    scopes = "user-read-currently-playing user-read-playback-state"
    return RedirectResponse(f"https://accounts.spotify.com/authorize?client_id={SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri={SPOTIFY_REDIRECT_URI}&scope={scopes}&state={api_key}")

@router.get("/spotify/callback")
async def spotify_callback(code: str, state: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.api_key == state).first()
    if not user: raise HTTPException(401)
    
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
