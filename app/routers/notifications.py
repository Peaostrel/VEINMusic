"""Social notifications of the signed-in user (likes, comments, new followers)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models import User
from app.services import notifications

router = APIRouter(prefix="/api/me/notifications", tags=["notifications"])


class MarkNotificationsRead(BaseModel):
    # None marks everything as read
    ids: list[int] | None = Field(None, max_length=200)


@router.get("")
def list_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=notifications.MAX_LIST)] = 30,
):
    """Latest notifications and the number of unread ones."""
    return notifications.list_for_user(db, int(current_user.id), limit)


@router.post("/read")
def mark_notifications_read(
    payload: MarkNotificationsRead,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    updated = notifications.mark_read(db, int(current_user.id), payload.ids)
    db.commit()
    return {"status": "ok", "updated": updated}
