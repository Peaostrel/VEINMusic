"""Account data export and deletion (GDPR data portability / erasure)."""
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import get_current_user, verify_password
from app.database import get_db
from app.models import (
    Achievement,
    ApiKey,
    DeviceAuthorization,
    ExternalSyncConfig,
    Follow,
    LastfmImportJob,
    PushSubscription,
    Scrobble,
    ScrobbleComment,
    ScrobbleLike,
    Track,
    User,
    UserAchievement,
    Webhook,
)

router = APIRouter(prefix="/api/account", tags=["account"])


class AccountDeleteRequest(BaseModel):
    password: str = Field(..., max_length=128)


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def build_account_export(user: User, db: Session) -> dict[str, Any]:
    profile = user.profile
    integration = user.integration

    scrobbles = [
        {"played_at": _iso(s.played_at), "artist": t.artist, "title": t.title, "album": t.album,
         "source": s.source, "listened_sec": s.listened_sec, "xp_earned": s.xp_earned,
         "is_imported": s.is_imported, "track_url": t.track_url}
        for s, t in db.query(Scrobble, Track).join(Track).filter(Scrobble.user_id == user.id)
        .order_by(Scrobble.played_at.asc()).yield_per(1000)
    ]
    following = [u for (u,) in db.query(User.username).join(Follow, Follow.following_id == User.id)
                 .filter(Follow.follower_id == user.id)]
    followers = [u for (u,) in db.query(User.username).join(Follow, Follow.follower_id == User.id)
                 .filter(Follow.following_id == user.id)]
    achievements = [
        {"name": a.name, "description": a.description, "earned_at": _iso(ua.earned_at)}
        for ua, a in db.query(UserAchievement, Achievement).join(Achievement)
        .filter(UserAchievement.user_id == user.id)
    ]
    comments = [
        {"scrobble_id": c.scrobble_id, "content": c.content, "created_at": _iso(c.created_at)}
        for c in db.query(ScrobbleComment).filter(ScrobbleComment.user_id == user.id)
    ]
    likes = [{"scrobble_id": lk.scrobble_id, "created_at": _iso(lk.created_at)}
             for lk in db.query(ScrobbleLike).filter(ScrobbleLike.user_id == user.id)]
    api_keys = [{"name": k.name, "prefix": k.prefix, "scopes": k.scopes, "is_active": k.is_active,
                 "created_at": _iso(k.created_at), "last_used_at": _iso(k.last_used_at)}
                for k in db.query(ApiKey).filter(ApiKey.user_id == user.id)]
    webhooks = [{"url": w.url, "events": w.events, "is_active": w.is_active,
                 "created_at": _iso(w.created_at)}
                for w in db.query(Webhook).filter(Webhook.user_id == user.id)]
    sync = db.query(ExternalSyncConfig).filter(ExternalSyncConfig.user_id == user.id).first()

    profile_fields = [
        "display_name", "bio", "avatar_url", "cover_url", "location", "favorite_genre", "equipment",
        "social_links", "theme", "is_private", "hidden_artists", "sync_privacy", "favorite_artist",
        "favorite_track", "favorite_album", "avatar_frame",
    ]
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "account": {"username": user.username, "role": user.role, "is_banned": user.is_banned},
        "profile": {f: _iso(getattr(profile, f, None)) for f in profile_fields} if profile else {},
        # Credentials themselves are never exported, only which ones exist
        "integrations": {
            "lastfm_username": integration.lastfm_username if integration else None,
            "spotify_linked": bool(integration and integration.spotify_refresh_token),
            "yandex_linked": bool(integration and integration.yandex_token),
            "bonus_xp": integration.bonus_xp if integration else 0,
            "current_streak": integration.current_streak if integration else 0,
            "external_export": {
                "lastfm": bool(sync and sync.is_lastfm_enabled),
                "listenbrainz": bool(sync and sync.is_listenbrainz_enabled),
                "librefm": bool(sync and sync.is_librefm_enabled),
            },
        },
        "scrobbles": scrobbles,
        "following": following,
        "followers": followers,
        "achievements": achievements,
        "comments": comments,
        "likes": likes,
        "api_keys": api_keys,
        "webhooks": webhooks,
        "push_subscriptions": db.query(PushSubscription).filter(PushSubscription.user_id == user.id).count(),
    }


@router.get("/export")
@limiter.limit("5/hour")
def export_account(request: Request,
                   db: Annotated[Session, Depends(get_db)],
                   current_user: Annotated[User, Depends(get_current_user)]):
    """Download all personal data as JSON."""
    data = build_account_export(current_user, db)
    filename = f"veinmusic-{current_user.username}-{datetime.now(UTC):%Y%m%d}.json"
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("", responses={400: {"description": "Wrong password"}})
@limiter.limit("5/hour")
def delete_account(request: Request, payload: AccountDeleteRequest, response: Response,
                   db: Annotated[Session, Depends(get_db)],
                   current_user: Annotated[User, Depends(get_current_user)]):
    """Permanently delete the account and all related data."""
    if not verify_password(payload.password, str(current_user.hashed_password)):
        raise HTTPException(400, "Неверный пароль")
    if current_user.role == "admin" and db.query(User).filter(User.role == "admin").count() <= 1:
        raise HTTPException(400, "Нельзя удалить единственного администратора")

    user_id = current_user.id
    # Rows without an ORM cascade from User are removed explicitly so this also
    # works on databases where foreign keys are not enforced (SQLite).
    owned_models: tuple[Any, ...] = (ApiKey, Webhook, ExternalSyncConfig, PushSubscription,
                                     DeviceAuthorization, LastfmImportJob)
    for model in owned_models:
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)
    db.delete(current_user)
    db.commit()
    response.delete_cookie("api_key")
    return {"status": "deleted"}
