import hashlib
import os
import secrets
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import (
    SECRET_KEY,
    create_session_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.database import get_db
from app.models import User, UserIntegration, UserProfile
from app.schemas import UserCreate

router = APIRouter(prefix="/auth", tags=["auth"])

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv(
    "SPOTIFY_REDIRECT_URI",
    "http://127.0.0.1:8000/auth/spotify/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@router.post("/register", responses={400: {"description": "Bad Request"}})
@limiter.limit("3/minute")
def register(request: Request, data: UserCreate, response: Response,
             db: Annotated[Session, Depends(get_db)]):
    data.username = data.username.lower()
    if len(data.username) < 3:
        raise HTTPException(400, "Никнейм слишком короткий")
    if len(data.password) < 6:
        raise HTTPException(400, "Пароль должен быть не менее 6 символов")
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(400, "Никнейм занят")

    # Generate API Key, compute SHA-256 and store in DB
    raw_api_key = secrets.token_hex(16)
    hashed_api_key = hashlib.pbkdf2_hmac('sha256', raw_api_key.encode('utf-8'), SECRET_KEY.encode(), 100000).hex()

    new_user = User(
        username=data.username,
        hashed_password=get_password_hash(
            data.password),
        api_key=hashed_api_key)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    db.add(UserProfile(user_id=new_user.id))
    db.add(UserIntegration(user_id=new_user.id))
    db.commit()

    # Set signed session token in cookie
    session_token = create_session_token(
        str(new_user.id), str(new_user.hashed_password))
    safe_token = session_token.replace('\r', '').replace('\n', '')
    response.set_cookie(
        key="api_key",
        value=safe_token,
        httponly=True,
        # Set to True in production (HTTPS)
        secure=os.getenv("ENVIRONMENT") == "production",
        samesite="strict",
        max_age=30 * 24 * 3600
    )
    return {"message": "Успешная регистрация", "username": new_user.username, "api_key": raw_api_key}


@router.post("/login", responses={400: {"description": "Bad Request"}})
@limiter.limit("5/minute")
def login(request: Request, data: UserCreate, response: Response,
          db: Annotated[Session, Depends(get_db)]):
    data.username = data.username.lower()
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, str(user.hashed_password)):
        raise HTTPException(400, "Неверный логин/пароль")

    # Set signed session token in cookie
    session_token = create_session_token(str(user.id), str(user.hashed_password))
    safe_token = session_token.replace('\r', '').replace('\n', '')
    response.set_cookie(
        key="api_key",
        value=safe_token,
        httponly=True,
        # Set to True in production
        secure=os.getenv("ENVIRONMENT") == "production",
        samesite="strict",
        max_age=30 * 24 * 3600
    )
    return {"username": user.username}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("api_key")
    return {"message": "Успешный выход"}


@router.get("/spotify/login")
def spotify_login(current_user: Annotated[User, Depends(
        get_current_user)], response: Response):
    scopes = "user-read-currently-playing user-read-playback-state"
    state = secrets.token_hex(16)
    response.set_cookie(
        key="spotify_auth_state",
        value=state,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production",
        samesite="lax",
        max_age=3600  # 1 hour
    )
    return RedirectResponse(
        f"https://accounts.spotify.com/authorize?client_id={SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri={SPOTIFY_REDIRECT_URI}&scope={scopes}&state={state}")


@router.get("/spotify/callback",
            responses={400: {"description": "Invalid state parameter"}})
async def spotify_callback(code: str,
                           state: str,
                           request: Request,
                           response: Response,
                           db: Annotated[Session,
                                         Depends(get_db)],
                           current_user: Annotated[User,
                                                   Depends(get_current_user)]):
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
