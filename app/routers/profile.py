import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import SECRET_KEY, get_current_user
from app.database import get_db
from app.models import User
from app.schemas import PrivacyUpdate, ProfileUpdate
from app.services.metadata_search import search_metadata
from app.utils import sanitize_text

router = APIRouter(prefix="/api/profile", tags=["profile"])


async def _update_favorite(user_profile, field_value, field_name, entity_type):
    if field_value is None:
        return False

    current_val = getattr(user_profile, field_name)
    if field_value == current_val:
        return False

    updated_at = getattr(user_profile, f"{field_name}_updated_at")
    if updated_at and datetime.now(UTC) < updated_at + timedelta(days=30):
        raise HTTPException(400, "Вы можете изменить это поле только раз в 30 дней.")

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

    return True


def _validate_url(url: str | None):
    if url and not url.startswith(("http:", "https:")):
        raise HTTPException(400, "Invalid URL")


def _validate_and_set_social(profile, social_links: str | None):
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
        ('avatar_frame', True)
    ]
    for field, sanitize in string_fields:
        val = getattr(data, field)
        if val is not None:
            setattr(profile, field, sanitize_text(val) if sanitize else val)

    other_fields = [
        'is_private',
        'sync_privacy'
    ]
    for field in other_fields:
        val = getattr(data, field)
        if val is not None:
            setattr(profile, field, val)


@router.post("/update", responses={400: {"description": "Bad Request"}})
@limiter.limit("20/minute")
async def update_profile(request: Request, data: ProfileUpdate, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user

    changed1 = await _update_favorite(user.profile, data.favorite_artist, 'favorite_artist', 'artist')
    changed2 = await _update_favorite(user.profile, data.favorite_track, 'favorite_track', 'track')
    changed3 = await _update_favorite(user.profile, data.favorite_album, 'favorite_album', 'album')

    if changed1 or changed2 or changed3:
        now = datetime.now(UTC)
        user.profile.favorite_artist_updated_at = now
        user.profile.favorite_track_updated_at = now
        user.profile.favorite_album_updated_at = now

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
@limiter.limit("20/minute")
def update_privacy(request: Request, data: PrivacyUpdate, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    if data.is_private is not None:
        current_user.profile.is_private = data.is_private
    if data.hidden_artists is not None:
        current_user.profile.hidden_artists = str(data.hidden_artists)
    if data.sync_privacy is not None:
        current_user.profile.sync_privacy = data.sync_privacy
    db.commit()
    return {"status": "ok"}


@router.post("/apikey/generate")
def generate_api_key(db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    raw_key = secrets.token_hex(16)
    hashed_key = hashlib.pbkdf2_hmac('sha256', raw_key.encode('utf-8'), SECRET_KEY.encode(), 100000).hex()
    current_user.api_key = hashed_key  # type: ignore[assignment]
    db.commit()
    return {"api_key": raw_key}
