"""Reports: users flag a profile or a comment for the moderators."""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.core.constants import USER_NOT_FOUND
from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.database import get_db
from app.models import Report, ScrobbleComment, User
from app.utils import sanitize_text

router = APIRouter(prefix="/api/reports", tags=["reports"])

REASONS = ("spam", "abuse", "inappropriate", "cheating", "impersonation", "other")


class ReportCreate(BaseModel):
    target_type: Literal["user", "comment"]
    username: str | None = Field(default=None, max_length=64)
    comment_id: int | None = None
    reason: Literal["spam", "abuse", "inappropriate", "cheating", "impersonation", "other"]
    details: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _target_given(self):
        if self.target_type == "user" and not self.username:
            raise ValueError("username is required for a profile report")
        if self.target_type == "comment" and not self.comment_id:
            raise ValueError("comment_id is required for a comment report")
        return self


@router.post("", responses={400: {"description": "Reporting yourself"},
                            404: {"description": "Target not found"}})
@limiter.limit("10/hour")
def create_report(
    request: Request,
    data: ReportCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    comment = None
    if data.target_type == "comment":
        comment = db.query(ScrobbleComment).filter(ScrobbleComment.id == data.comment_id).first()
        if not comment:
            raise HTTPException(404, "Комментарий не найден")
        target_id = int(comment.user_id)
    else:
        target = db.query(User.id).filter(User.username == data.username).first()
        if not target:
            raise HTTPException(404, USER_NOT_FOUND)
        target_id = int(target[0])
    if target_id == user.id:
        raise HTTPException(400, "Нельзя пожаловаться на себя")

    # One open report per reporter and target is enough
    duplicate = db.query(Report.id).filter(
        Report.reporter_id == user.id, Report.status == "open", Report.target_user_id == target_id,
        Report.comment_id.is_(None) if comment is None else Report.comment_id == comment.id,
    ).first()
    if duplicate:
        return {"status": "already_reported"}

    db.add(Report(
        reporter_id=user.id,
        target_user_id=target_id,
        comment_id=comment.id if comment else None,
        comment_text=str(comment.content or "")[:500] if comment else None,
        reason=data.reason,
        details=sanitize_text(data.details.strip()) if data.details and data.details.strip() else None,
        status="open",
    ))
    db.commit()
    return {"status": "ok"}
