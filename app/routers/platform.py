"""Platform endpoints: announcements, flags, frames, push, rooms."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.core.websockets import manager
from app.database import get_db
from app.models import (
    User,
)
from app.services import runtime_settings
from app.services.runtime_settings import require_feature
from app.schemas import (
    PushSubscribeRequest,
    PushUnsubscribeRequest,
)

router = APIRouter(tags=["platform"])

# Each notification goes to every subscription of the user, so their number
# is capped (the oldest are dropped): browsers re-subscribe on their own.
MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10

# --- GET /api/error/rate-limited ---


@router.get("/api/error/rate-limited")
def rate_limited(): return JSONResponse(status_code=429, content={
    "error": "Too many requests. Please wait a minute."})


# --- /api/announcements/active ---
@router.get("/api/announcements/active")
def get_active_announcements(db: Annotated[Session, Depends(get_db)]):
    """Retrieve currently active system announcements."""
    from sqlalchemy import or_

    from app.models import SystemAnnouncement
    now = datetime.now(UTC)
    announcements = (
        db.query(SystemAnnouncement)
        .filter(
            SystemAnnouncement.is_active.is_(True),
            or_(SystemAnnouncement.expires_at.is_(None), SystemAnnouncement.expires_at > now)
        )
        .order_by(SystemAnnouncement.id.desc())
        .all()
    )
    return {
        "announcements": [
            {
                "id": a.id,
                "title": a.title,
                "message": a.message,
                "type": a.type,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in announcements
        ]
    }


# --- /api/feature-flags ---
@router.get("/api/feature-flags")
def get_public_feature_flags(db: Annotated[Session, Depends(get_db)]):
    """Feature flags (known features without a row are reported as on)."""
    return {"flags": runtime_settings.feature_flags(db)}


# --- /api/frames ---
@router.get("/api/frames")
def get_public_avatar_frames(db: Annotated[Session, Depends(get_db)]):
    """Retrieve list of all active avatar frames."""
    from app.models import AvatarFrame
    frames = (
        db.query(AvatarFrame)
        .filter(AvatarFrame.is_active.is_(True))
        .order_by(AvatarFrame.required_level.asc())
        .all()
    )
    return {
        "frames": [
            {
                "id": f.id,
                "name": f.name,
                "code": f.code,
                "css_style": f.css_style,
                "image_url": f.image_url,
                "rarity": f.rarity,
                "required_level": f.required_level,
            }
            for f in frames
        ]
    }


# --- Web Push Notifications (PWA) ---
@router.get("/api/push/vapid-key")
def get_vapid_key():
    from app.services.push_notifications import is_enabled, vapid_public_key
    return {"enabled": is_enabled(), "vapid_public_key": vapid_public_key()}


@router.post("/api/push/subscribe", responses={400: {"description": "Invalid endpoint"},
                                               503: {"description": "Web Push is not configured"}})
@limiter.limit("10/minute")
def subscribe_push(
    request: Request,
    payload: PushSubscribeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    from app.models import PushSubscription
    from app.services.push_notifications import is_enabled
    from app.utils import is_safe_url

    if not is_enabled():
        raise HTTPException(503, "Web Push не настроен на сервере")

    if not payload.endpoint.startswith("https://") or not is_safe_url(payload.endpoint):
        raise HTTPException(400, "Некорректный push endpoint")

    # endpoint is globally unique: a browser re-subscribing under another
    # account takes the subscription over instead of failing with a 500.
    existing = db.query(PushSubscription).filter(
        PushSubscription.endpoint == payload.endpoint,
    ).first()

    if existing:
        existing.user_id = current_user.id  # type: ignore[assignment]
        existing.p256dh = payload.p256dh  # type: ignore[assignment]
        existing.auth = payload.auth  # type: ignore[assignment]
        # counts as the newest subscription again for the per-user cap
        existing.created_at = datetime.now(UTC)  # type: ignore[assignment]
    else:
        new_sub = PushSubscription(
            user_id=current_user.id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth=payload.auth,
        )
        db.add(new_sub)
    db.flush()

    stale = (
        db.query(PushSubscription.id)
        .filter(PushSubscription.user_id == current_user.id)
        .order_by(PushSubscription.created_at.desc(), PushSubscription.id.desc())
        .offset(MAX_PUSH_SUBSCRIPTIONS_PER_USER)
        .all()
    )
    if stale:
        db.query(PushSubscription).filter(
            PushSubscription.id.in_([row.id for row in stale]),
        ).delete(synchronize_session=False)

    db.commit()
    return {"status": "ok", "message": "Подписка на Web Push успешно оформлена"}


@router.post("/api/push/unsubscribe")
def unsubscribe_push(
    payload: PushUnsubscribeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    from app.models import PushSubscription
    db.query(PushSubscription).filter(
        PushSubscription.user_id == current_user.id,
        PushSubscription.endpoint == payload.endpoint,
    ).delete(synchronize_session=False)
    db.commit()
    return {"status": "ok"}


@router.post("/api/push/send-test")
@limiter.limit("3/minute")
async def send_test_push(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    from app.services.push_notifications import notify_user_push
    sent = await notify_user_push(
        user_id=int(current_user.id),
        title="VEIN Music",
        body="Тестовое уведомление: PWA Web Push работает идеально! 🎵",
        url="/",
        db=db,
    )
    return {"status": "ok", "delivered_count": sent}


# --- Listen Together REST API ---
@router.get("/api/together/rooms", dependencies=[Depends(require_feature("listen_together"))],
            responses={503: {"description": "Listen Together is switched off"}})
async def list_together_rooms():
    """List active Listen Together rooms with listener counts and current tracks."""
    return {"rooms": await manager.get_active_rooms_info()}
