import hashlib
import json
import re
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
from app.services.cache import clear_all
from app.services.metadata_search import search_metadata
from app.utils import sanitize_text

router = APIRouter(prefix="/api/profile", tags=["profile"])


FAVORITE_LOCK = timedelta(days=30)


def _as_utc(value: datetime) -> datetime:
    # SQLite returns naive datetimes even for timezone-aware columns
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def _update_favorite(user_profile, field_value, field_name, entity_type):
    """Set one showcase favorite. Returns True when the value changed.

    Picking a new favorite locks that field (only that one) for 30 days.
    The settings form always sends all three favorites, and an empty input
    comes as "" while the column holds NULL: both mean "not set", so they
    must not count as a change.
    """
    if field_value is None:
        return False

    new_value = field_value.strip()
    current_val = getattr(user_profile, field_name) or ""
    if new_value == current_val:
        return False

    updated_at = getattr(user_profile, f"{field_name}_updated_at")
    if new_value and updated_at and datetime.now(UTC) < _as_utc(updated_at) + FAVORITE_LOCK:
        raise HTTPException(400, "Вы можете изменить это поле только раз в 30 дней.")

    if not new_value:
        # Clearing is always allowed and does not start a new lock
        setattr(user_profile, field_name, None)
        setattr(user_profile, f"{field_name}_cover", None)
        setattr(user_profile, f"{field_name}_url", None)
        return True

    title, cover, url = await search_metadata(new_value, entity_type)
    setattr(user_profile, field_name, sanitize_text(title or new_value))
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
    setattr(user_profile, f"{field_name}_updated_at", datetime.now(UTC))
    return True


FAVORITE_FIELDS = (("favorite_artist", "artist"), ("favorite_track", "track"), ("favorite_album", "album"))


async def refresh_favorites(user_profile) -> list[str]:
    """Look the set favorites up again (name, picture, link) without
    touching their 30-day locks. Returns the fields that changed."""
    changed = []
    for field_name, entity_type in FAVORITE_FIELDS:
        value = getattr(user_profile, field_name)
        if not value:
            continue
        title, cover, url = await search_metadata(value, entity_type)
        new = {field_name: sanitize_text(title) if title else value,
               f"{field_name}_cover": cover or getattr(user_profile, f"{field_name}_cover"),
               f"{field_name}_url": url or getattr(user_profile, f"{field_name}_url")}
        if any(getattr(user_profile, k) != v for k, v in new.items()):
            for k, v in new.items():
                setattr(user_profile, k, v)
            changed.append(field_name)
    return changed


def _validate_url(url: str | None):
    if url and not url.startswith(("http:", "https:")):
        raise HTTPException(400, "Invalid URL")


SOCIAL_NETWORKS = {"telegram", "vk", "steam", "github", "instagram"}
MAX_SOCIAL_LINKS = 10
_SOCIAL_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,64}$")


def _normalize_social_links(raw: str) -> str:
    """Keep only known networks and plain usernames: the profile page builds
    the link from them, so a free-form value could point anywhere."""
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Некорректный список соцсетей")
    if not isinstance(items, list) or len(items) > MAX_SOCIAL_LINKS:
        raise HTTPException(400, f"Можно указать до {MAX_SOCIAL_LINKS} соцсетей")
    clean: list[dict[str, object]] = []
    for item in items:
        if not isinstance(item, dict):
            raise HTTPException(400, "Некорректный список соцсетей")
        network = str(item.get("network", "")).lower()
        username = str(item.get("username", "")).strip().lstrip("@")
        if network not in SOCIAL_NETWORKS or not _SOCIAL_USERNAME_RE.match(username):
            raise HTTPException(
                400, "Соцсеть: укажите ник из латинских букв, цифр, «_», «.» или «-»")
        item_id = item.get("id")
        clean.append({
            "id": item_id if isinstance(item_id, (int, str)) else len(clean),
            "network": network,
            "username": username,
        })
    return json.dumps(clean, ensure_ascii=False)


def _validate_and_set_social(profile, social_links: str | None):
    if social_links is not None:
        profile.social_links = _normalize_social_links(social_links)


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
    privacy_changed = data.is_private is not None and user.profile.is_private != data.is_private

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
    if privacy_changed:
        clear_all()
    return {"status": "ok"}


@router.post("/privacy")
@limiter.limit("20/minute")
def update_privacy(request: Request, data: PrivacyUpdate, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    privacy_changed = (data.is_private is not None
                       and current_user.profile.is_private != data.is_private)
    if data.is_private is not None:
        current_user.profile.is_private = data.is_private
    if data.hidden_artists is not None:
        current_user.profile.hidden_artists = str(data.hidden_artists)
    if data.sync_privacy is not None:
        current_user.profile.sync_privacy = data.sync_privacy
    db.commit()
    if privacy_changed:
        clear_all()
    return {"status": "ok"}


@router.post("/apikey/generate")
def generate_api_key(db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    raw_key = secrets.token_hex(16)
    hashed_key = hashlib.pbkdf2_hmac('sha256', raw_key.encode('utf-8'), SECRET_KEY.encode(), 100000).hex()
    current_user.api_key = hashed_key  # type: ignore[assignment]
    db.commit()
    return {"api_key": raw_key}
