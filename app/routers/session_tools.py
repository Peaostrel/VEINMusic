"""Only browser sessions can manage other browser sessions."""
from datetime import UTC, datetime
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from app.core.security import get_current_user
from app.database import get_db
from app.models import User, UserSession
from app.services.sessions import current_session_id

router = APIRouter(prefix="/api/account/sessions", tags=["account"])


@router.get("")
def sessions(request: Request, response: Response, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]):
    response.headers["Cache-Control"] = "no-store"
    rows = db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.revoked.is_(False),
                                        UserSession.session_version == user.session_version, UserSession.expires_at > datetime.now(UTC)).order_by(UserSession.last_seen_at.desc()).limit(100).all()
    return {"items": [{"id": row.id, "device": row.device, "created_at": row.created_at, "last_seen_at": row.last_seen_at,
                       "expires_at": row.expires_at, "current": row.id == current_session_id(request)} for row in rows],
            "legacy_session": current_session_id(request) is None,
            "note": "Старые сессии можно отозвать кнопкой выхода со всех устройств. API-ключи управляются отдельно."}


@router.delete("/{session_id}", responses={404: {"description": "Session not found"}})
async def revoke_session(session_id: str, request: Request, response: Response, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]):
    row = db.query(UserSession).filter_by(id=session_id, user_id=user.id).first()
    if not row:
        raise HTTPException(404, "Сессия не найдена")
    row.revoked = True  # type: ignore[assignment]
    db.commit()
    from app.core.websockets import manager
    await manager.revoke_session(str(user.username), session_id)
    if session_id == current_session_id(request):
        response.delete_cookie("api_key")
    response.headers["Cache-Control"] = "no-store"
    return {"status": "ok", "current": session_id == current_session_id(request)}
