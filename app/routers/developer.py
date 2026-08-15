"""Developer Portal Router: API Keys, Webhooks, and External Scrobble Sync."""
from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user, hash_developer_key
from app.database import get_db
from app.models import ApiKey, ExternalSyncConfig, User, Webhook
from app.schemas import ApiKeyCreate, ExternalSyncUpdate, WebhookCreate
from app.services.webhooks import dispatch_webhook_event

router = APIRouter(prefix="/api/developer", tags=["developer"])


def _hash_key(plain_key: str) -> str:
    return hash_developer_key(plain_key)


# ─── API KEYS MANAGEMENT ──────────────────────────────────────────────────────

@router.get("/keys")
def list_api_keys(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """List active API keys for the current user."""
    keys = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == current_user.id, ApiKey.is_active == True)  # noqa: E712
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return [
        {
            "id": k.id,
            "name": k.name,
            "prefix": k.prefix,
            "scopes": (k.scopes or "").split(","),
            "created_at": k.created_at.isoformat() if k.created_at else None,
            "expires_at": k.expires_at.isoformat() if k.expires_at else None,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
        }
        for k in keys
    ]


@router.post("/keys")
def create_api_key(
    payload: ApiKeyCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Generate a new developer API key (returned once)."""
    raw_secret = secrets.token_urlsafe(32)
    key_prefix = f"vm_{raw_secret[:6]}"
    full_key = f"vm_{raw_secret}"
    key_hash = _hash_key(full_key)

    expires_at = None
    if payload.expires_in_days:
        expires_at = datetime.now(UTC) + timedelta(days=payload.expires_in_days)

    api_key_obj = ApiKey(
        user_id=current_user.id,
        key_hash=key_hash,
        prefix=key_prefix,
        name=payload.name,
        scopes=payload.scopes,
        is_active=True,
        expires_at=expires_at,
    )
    db.add(api_key_obj)
    db.commit()
    db.refresh(api_key_obj)

    return {
        "id": api_key_obj.id,
        "name": api_key_obj.name,
        "api_key": full_key,
        "prefix": key_prefix,
        "scopes": (api_key_obj.scopes or "").split(","),
        "expires_at": api_key_obj.expires_at.isoformat() if api_key_obj.expires_at else None,
        "message": "Сохраните этот API ключ сейчас. Вы больше не сможете увидеть его полный текст.",
    }


@router.delete("/keys/{key_id}", responses={404: {"description": "API Key Not Found"}})
def revoke_api_key(
    key_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Revoke an API key."""
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == current_user.id).first()
    if not key:
        raise HTTPException(404, "API ключ не найден")

    key.is_active = False  # type: ignore[assignment]
    db.commit()
    return {"status": "ok", "message": "API ключ успешно отозван"}


# ─── WEBHOOKS MANAGEMENT ──────────────────────────────────────────────────────

@router.get("/webhooks")
def list_webhooks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """List webhooks for current user."""
    whs = db.query(Webhook).filter(Webhook.user_id == current_user.id).all()
    return [
        {
            "id": w.id,
            "url": w.url,
            "events": (w.events or "").split(","),
            "is_active": w.is_active,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in whs
    ]


@router.post("/webhooks")
def create_webhook(
    payload: WebhookCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Register a new webhook subscription."""
    secret = secrets.token_hex(24)
    wh = Webhook(
        user_id=current_user.id,
        url=str(payload.url),
        secret=secret,
        events=payload.events,
        is_active=True,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)

    return {
        "id": wh.id,
        "url": wh.url,
        "secret": wh.secret,
        "events": (wh.events or "").split(","),
        "message": "Вебхук успешно зарегистрирован. Используйте secret для проверки подписи X-VEIN-Signature.",
    }


@router.delete("/webhooks/{webhook_id}", responses={404: {"description": "Webhook Not Found"}})
def delete_webhook(
    webhook_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Delete a webhook subscription."""
    wh = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.user_id == current_user.id).first()
    if not wh:
        raise HTTPException(404, "Вебхук не найден")

    db.delete(wh)
    db.commit()
    return {"status": "ok", "message": "Вебхук успешно удален"}


@router.post("/webhooks/{webhook_id}/test", responses={404: {"description": "Webhook Not Found"}})
async def test_webhook(
    webhook_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Send test event to the specified webhook."""
    wh = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.user_id == current_user.id).first()
    if not wh:
        raise HTTPException(404, "Вебхук не найден")

    await dispatch_webhook_event(
        event_name="ping.test",
        data={"message": "VEINMusic Webhook Test Ping", "username": current_user.username},
        user_id=int(current_user.id),
        db=db,
    )
    return {"status": "ok", "message": f"Тестовое событие отправлено на {wh.url}"}


# ─── EXTERNAL SCROBBLE EXPORT SETTINGS ───────────────────────────────────────

@router.get("/export/config")
def get_export_config(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Get external scrobble export configurations."""
    config = db.query(ExternalSyncConfig).filter(ExternalSyncConfig.user_id == current_user.id).first()
    if not config:
        return {
            "is_lastfm_enabled": False,
            "has_lastfm_session": False,
            "is_listenbrainz_enabled": False,
            "has_listenbrainz_token": False,
            "is_librefm_enabled": False,
            "has_librefm_session": False,
            "last_synced_at": None,
        }

    return {
        "is_lastfm_enabled": bool(config.is_lastfm_enabled),
        "has_lastfm_session": bool(config.lastfm_session_key),
        "is_listenbrainz_enabled": bool(config.is_listenbrainz_enabled),
        "has_listenbrainz_token": bool(config.listenbrainz_token),
        "is_librefm_enabled": bool(config.is_librefm_enabled),
        "has_librefm_session": bool(config.librefm_session_key),
        "last_synced_at": config.last_synced_at.isoformat() if config.last_synced_at else None,
    }


@router.post("/export/config")
def update_export_config(
    payload: ExternalSyncUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Update external export credentials and toggles."""
    config = db.query(ExternalSyncConfig).filter(ExternalSyncConfig.user_id == current_user.id).first()
    if not config:
        config = ExternalSyncConfig(user_id=current_user.id)
        db.add(config)

    if payload.lastfm_session_key is not None:
        config.lastfm_session_key = payload.lastfm_session_key  # type: ignore[assignment]
    if payload.listenbrainz_token is not None:
        config.listenbrainz_token = payload.listenbrainz_token  # type: ignore[assignment]
    if payload.librefm_session_key is not None:
        config.librefm_session_key = payload.librefm_session_key  # type: ignore[assignment]

    if payload.is_lastfm_enabled is not None:
        config.is_lastfm_enabled = payload.is_lastfm_enabled  # type: ignore[assignment]
    if payload.is_listenbrainz_enabled is not None:
        config.is_listenbrainz_enabled = payload.is_listenbrainz_enabled  # type: ignore[assignment]
    if payload.is_librefm_enabled is not None:
        config.is_librefm_enabled = payload.is_librefm_enabled  # type: ignore[assignment]

    db.commit()
    return {"status": "ok", "message": "Настройки экспорта сохранены"}
