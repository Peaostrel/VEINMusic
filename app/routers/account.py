"""Account data export and deletion (GDPR data portability / erasure)."""
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import get_current_user, verify_password
from app.database import get_db
from app.models import (
    Achievement,
    EmailAccount,
    EmailOutbox,
    ApiKey,
    DeviceAuthorization,
    ExternalSyncConfig,
    Follow,
    LastfmImportJob,
    ListenLater,
    RecommendationFeedback,
    RecommendationImpression,
    PushSubscription,
    Scrobble,
    ScrobbleComment,
    ScrobbleLike,
    Track,
    User,
    UserAchievement,
    Webhook,
)
from app.services import notifications
from app.services.achievements import render_achievement_description

router = APIRouter(prefix="/api/account", tags=["account"])


class AccountDeleteRequest(BaseModel):
    password: str = Field(..., max_length=128)
    otp_code: str | None = Field(default=None, max_length=64)


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def build_account_export(user: User, db: Session, include_history: bool = True) -> dict[str, Any]:
    profile = user.profile
    integration = user.integration

    scrobbles = list(export_history(db, int(user.id))) if include_history else []
    following = [u for (u,) in db.query(User.username).join(Follow, Follow.following_id == User.id)
                 .filter(Follow.follower_id == user.id)]
    followers = [u for (u,) in db.query(User.username).join(Follow, Follow.follower_id == User.id)
                 .filter(Follow.following_id == user.id)]
    achievements = [
        {"name": a.name, "description": render_achievement_description(a),
         "earned_at": _iso(ua.earned_at)}
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
    email_account = db.get(EmailAccount, user.id)
    return {
        "email_settings": {"email": email_account.email, "pending_email": email_account.pending_email,
                           "security_alerts": email_account.security_alerts, "messages_enabled": email_account.messages_enabled} if email_account else None,
        "format": "veinmusic",
        "version": 1,
        "exported_at": datetime.now(UTC).isoformat(),
        "account": {"username": user.username, "role": user.role, "is_banned": user.is_banned,
                    "pd_consent_at": _iso(user.pd_consent_at), "pd_consent_version": user.pd_consent_version,
                    "vk_id": user.vk_id},
        "profile": {f: _iso(getattr(profile, f, None)) for f in profile_fields} if profile else {},
        # Credentials themselves are never exported, only which ones exist
        "integrations": {
            "lastfm_username": integration.lastfm_username if integration else None,
            "spotify_linked": bool(integration and integration.spotify_refresh_token),
            "yandex_linked": bool(integration and integration.yandex_token),
            "soundcloud_linked": bool(integration and integration.soundcloud_refresh_token),
            "bonus_xp": integration.bonus_xp if integration else 0,
            "current_streak": integration.current_streak if integration else 0,
            "external_export": {
                "lastfm": bool(sync and sync.is_lastfm_enabled),
                "listenbrainz": bool(sync and sync.is_listenbrainz_enabled),
                "librefm": bool(sync and sync.is_librefm_enabled),
            },
        },
        "listen_later": [{"track_id": row.track_id, "note": row.note, "created_at": _iso(row.created_at)} for row in db.query(ListenLater).filter_by(user_id=user.id)],
        "recommendation_feedback": [{"track_id": row.track_id, "value": row.value} for row in db.query(RecommendationFeedback).filter_by(user_id=user.id)],
        "recommendation_history": [{"track_id": row.track_id, "shown_at": _iso(row.shown_at)} for row in db.query(RecommendationImpression).filter_by(user_id=user.id)],
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


def export_history(db, user_id, start=None, end=None):
    query = db.query(Scrobble, Track).execution_options(include_excluded=True).join(Track).filter(
        Scrobble.user_id == user_id)
    if start:
        query = query.filter(Scrobble.played_at >= start)
    if end:
        query = query.filter(Scrobble.played_at < end)
    query = query.order_by(Scrobble.played_at, Scrobble.id).yield_per(500)
    for row, track in query:
        yield {"played_at": _iso(row.played_at), "artist": track.artist, "title": track.title,
               "album": track.album, "duration": int(track.duration or 0), "source": row.source,
               "listened_sec": int(row.listened_sec or 0), "xp_earned": row.xp_earned,
               "excluded_from_stats": bool(row.excluded_from_stats),
               "is_imported": bool(row.is_imported), "track_url": track.track_url}


def stream_account_export(bind, user_id):
    # Own the session for the lifetime of the stream, including disconnects.
    with Session(bind=bind) as session:
        user = session.get(User, user_id)
        data = build_account_export(user, session, include_history=False)
        data.pop("scrobbles")
        prefix = json.dumps(data, ensure_ascii=False)
        yield prefix[:-1] + ', "scrobbles": ['
        separator = ""
        for item in export_history(session, user_id):
            yield separator + json.dumps(item, ensure_ascii=False)
            separator = ","
        yield "]}"


@router.get("/export")
@limiter.limit("5/hour")
def export_account(request: Request,
                   db: Annotated[Session, Depends(get_db)],
                   current_user: Annotated[User, Depends(get_current_user)]):
    """Download all personal data as JSON."""
    filename = f"veinmusic-{current_user.username}-{datetime.now(UTC):%Y%m%d}.json"
    return StreamingResponse(
        stream_account_export(db.get_bind(), int(current_user.id)),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@router.delete("", responses={400: {"description": "Wrong password or 2FA code"}})
@limiter.limit("5/hour")
def delete_account(request: Request, payload: AccountDeleteRequest, response: Response,
                   db: Annotated[Session, Depends(get_db)],
                   current_user: Annotated[User, Depends(get_current_user)]):
    """Permanently delete the account and all related data."""
    if not verify_password(payload.password, str(current_user.hashed_password)):
        raise HTTPException(400, "Неверный пароль")
    if current_user.totp_enabled:
        from app.services.mfa import consume_code
        # A stolen password alone must not erase an account protected by 2FA.
        if not payload.otp_code or not consume_code(db, current_user, payload.otp_code):
            raise HTTPException(400, "Введите действующий код двухфакторной защиты")
    if current_user.role == "admin" and db.query(User).filter(User.role == "admin").count() <= 1:
        raise HTTPException(400, "Нельзя удалить единственного администратора")

    user_id = current_user.id
    # Rows without an ORM cascade from User are removed explicitly so this also
    # works on databases where foreign keys are not enforced (SQLite).
    owned_models: tuple[Any, ...] = (EmailOutbox, EmailAccount, ApiKey, Webhook, ExternalSyncConfig, PushSubscription,
                                     DeviceAuthorization, LastfmImportJob)
    for model in owned_models:
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)
    notifications.delete_for_user(db, int(user_id))
    db.delete(current_user)
    db.commit()
    response.delete_cookie("api_key")
    return {"status": "deleted"}
