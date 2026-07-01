# mypy: ignore-errors
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Annotated, Optional
import json
import secrets
import hashlib

from app.database import get_db
from app.models import User
from app.schemas import ProfileUpdate
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
        setattr(
            user_profile,
            f"{field_name}_cover",
            cover or getattr(
                user_profile,
                f"{field_name}_cover"))
        setattr(
            user_profile,
            f"{field_name}_url",
            url or getattr(
                user_profile,
                f"{field_name}_url"))


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


def _update_profile_fields(profile, data: ProfileUpdate):
    string_fields = [
        ('theme', False),
        ('display_name', True),
        ('bio', True),
        ('location', True),
        ('favorite_genre', True),
        ('equipment', True),
        ('favorite_artist_review', True),
        ('favorite_track_review', True),
        ('favorite_album_review', True),
        ('avatar_frame', True)
    ]
    for field, sanitize in string_fields:
        val = getattr(data, field)
        if val is not None:
            setattr(profile, field, sanitize_text(val) if sanitize else val)

    other_fields = [
        'favorite_artist_rating',
        'favorite_track_rating',
        'favorite_album_rating',
        'is_private'
    ]
    for field in other_fields:
        val = getattr(data, field)
        if val is not None:
            setattr(profile, field, val)


@router.post("/update", responses={400: {"description": "Bad Request"}})
async def update_profile(data: ProfileUpdate, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user

    await _update_favorite(user.profile, data.favorite_artist, 'favorite_artist', 'artist')
    await _update_favorite(user.profile, data.favorite_track, 'favorite_track', 'track')
    await _update_favorite(user.profile, data.favorite_album, 'favorite_album', 'album')

    _update_profile_fields(user.profile, data)

    if data.avatar_url is not None:
        _validate_url(data.avatar_url)
        user.profile.avatar_url = data.avatar_url
    if data.cover_url is not None:
        _validate_url(data.cover_url)
        user.profile.cover_url = data.cover_url
    if data.hidden_artists is not None:
        user.profile.hidden_artists = sanitize_text(data.hidden_artists) or ""
    if data.lastfm_username is not None:
        user.integration.lastfm_username = sanitize_text(data.lastfm_username)

    _validate_and_set_social(user.profile, data.social_links)

    db.commit()
    return {"status": "ok"}


@router.post("/privacy")
def update_privacy(data: dict, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    if "is_private" in data:
        current_user.profile.is_private = bool(data["is_private"])
    if "hidden_artists" in data:
        current_user.profile.hidden_artists = str(data["hidden_artists"])
    db.commit()
    return {"status": "ok"}


@router.post("/apikey/generate")
def generate_api_key(db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    raw_key = secrets.token_hex(16)
    hashed_key = hashlib.sha256(raw_key.encode('utf-8')).hexdigest()
    current_user.api_key = hashed_key
    db.commit()
    return {"api_key": raw_key}
