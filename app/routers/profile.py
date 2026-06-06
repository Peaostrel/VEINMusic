from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Annotated, Optional
from datetime import datetime, timezone
import json
import secrets
import hashlib

from app.database import get_db
from app.models import User, Achievement, UserAchievement, Scrobble, Track
from app.schemas import ProfileUpdate, LikeRequest
from app.core.security import get_current_user
from app.services.metadata_search import search_metadata
from app.utils import sanitize_text

router = APIRouter(prefix="/api/profile", tags=["profile"])

async def _update_favorite(user_profile, field_value, field_name, entity_type):
    if field_value is None:
        return
    if field_value.strip() == "":
        setattr(user_profile, field_name, None)
        setattr(user_profile, f"{field_name}_cover", None)
        setattr(user_profile, f"{field_name}_url", None)
    else:
        title, cover, url = await search_metadata(field_value, entity_type)
        setattr(user_profile, field_name, sanitize_text(title or field_value))
        setattr(user_profile, f"{field_name}_cover", cover or getattr(user_profile, f"{field_name}_cover"))
        setattr(user_profile, f"{field_name}_url", url or getattr(user_profile, f"{field_name}_url"))

def _validate_url(url: Optional[str]):
    if url and not url.startswith(("http:", "https:")):
        raise HTTPException(400, "Invalid URL")

def _validate_and_set_social(profile, social_links: Optional[str]):
    if social_links is not None:
        try:
            json.loads(social_links)
            profile.social_links = social_links
        except json.JSONDecodeError:
            pass

@router.post("/update", responses={400: {"description": "Bad Request"}})
async def update_profile(data: ProfileUpdate, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    
    if data.theme is not None: user.profile.theme = data.theme
    
    await _update_favorite(user.profile, data.favorite_artist, 'favorite_artist', 'artist')
    await _update_favorite(user.profile, data.favorite_track, 'favorite_track', 'track')
    await _update_favorite(user.profile, data.favorite_album, 'favorite_album', 'album')
    
    if data.display_name is not None: user.profile.display_name = sanitize_text(data.display_name)
    if data.bio is not None: user.profile.bio = sanitize_text(data.bio)
    if data.avatar_url is not None:
        _validate_url(data.avatar_url)
        user.profile.avatar_url = data.avatar_url
    if data.cover_url is not None:
        _validate_url(data.cover_url)
        user.profile.cover_url = data.cover_url
    if data.location is not None: user.profile.location = sanitize_text(data.location)
    if data.favorite_genre is not None: user.profile.favorite_genre = sanitize_text(data.favorite_genre)
    if data.equipment is not None: user.profile.equipment = sanitize_text(data.equipment)
    if data.is_private is not None: user.profile.is_private = data.is_private
    if data.hidden_artists is not None: user.profile.hidden_artists = sanitize_text(data.hidden_artists) or ""
    if data.lastfm_username is not None: user.integration.lastfm_username = sanitize_text(data.lastfm_username)
    
    _validate_and_set_social(user.profile, data.social_links)
        
    db.commit()
    return {"status": "ok"}

@router.post("/privacy")
def update_privacy(data: dict, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    if "is_private" in data: current_user.profile.is_private = bool(data["is_private"])
    if "hidden_artists" in data: current_user.profile.hidden_artists = str(data["hidden_artists"])
    db.commit()
    return {"status": "ok"}

@router.post("/apikey/generate")
def generate_api_key(db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    raw_key = secrets.token_hex(16)
    hashed_key = hashlib.sha256(raw_key.encode('utf-8')).hexdigest()
    current_user.api_key = hashed_key
    db.commit()
    return {"api_key": raw_key}
