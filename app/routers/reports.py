"""Reports: users flag a profile, a comment or a catalog track for the moderators."""
from __future__ import annotations

import json
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.core.constants import USER_NOT_FOUND
from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.database import get_db
from app.models import Report, ScrobbleComment, Track, User
from app.services import notifications
from app.utils import sanitize_text

router = APIRouter(prefix="/api/reports", tags=["reports"])

REASONS = ("spam", "abuse", "inappropriate", "cheating", "impersonation", "other")
# Reasons that make sense for each kind of target
REASONS_BY_TARGET = {
    "user": set(REASONS),
    "comment": {"spam", "abuse", "inappropriate", "other"},
    "track": {"spam", "inappropriate", "other"},
}
REASON_LABELS = {
    "spam": "спам или реклама",
    "abuse": "оскорбления или травля",
    "inappropriate": "неприемлемый контент",
    "cheating": "накрутка прослушиваний",
    "impersonation": "выдаёт себя за другого",
    "other": "другое",
}


class ReportCreate(BaseModel):
    target_type: Literal["user", "comment", "track"]
    username: str | None = Field(default=None, max_length=64)
    comment_id: int | None = None
    track_id: int | None = None
    reason: Literal["spam", "abuse", "inappropriate", "cheating", "impersonation", "other"]
    details: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _target_given(self):
        if self.target_type == "user" and not self.username:
            raise ValueError("username is required for a profile report")
        if self.target_type == "comment" and not self.comment_id:
            raise ValueError("comment_id is required for a comment report")
        if self.target_type == "track" and not self.track_id:
            raise ValueError("track_id is required for a track report")
        if self.reason not in REASONS_BY_TARGET[self.target_type]:
            raise ValueError("this reason does not apply to this kind of report")
        return self


def _snapshot(**fields) -> str:
    """What the moderator will see even if the target changes meanwhile."""
    return json.dumps({k: (str(v)[:400] if v is not None else None) for k, v in fields.items()},
                      ensure_ascii=False)[:2000]


def _target_label(report: Report, db: Session) -> str:
    if report.target_type == "track":
        data = json.loads(str(report.target_snapshot or "{}"))
        return f"трек «{data.get('artist')} — {data.get('title')}»"
    username = db.query(User.username).filter(User.id == report.target_user_id).scalar()
    return f"комментарий @{username}" if report.target_type == "comment" else f"профиль @{username}"


def _alert_moderators(db: Session, report: Report) -> list:
    """The first open report about a target pings the admins (later ones on
    the same target would only repeat it)."""
    from app.services.notifications import KIND_MODERATION
    same = db.query(Report.id).filter(Report.status == "open", Report.id != report.id,
                                      Report.target_type == report.target_type)
    if report.target_type == "track":
        same = same.filter(Report.track_id == report.track_id)
    elif report.target_type == "comment":
        same = same.filter(Report.comment_id == report.comment_id)
    else:
        same = same.filter(Report.target_user_id == report.target_user_id)
    if same.first():
        return []
    message = f"Новая жалоба: {_target_label(report, db)}, {REASON_LABELS[str(report.reason)]}"
    alerts = []
    for (admin_id,) in db.query(User.id).filter(User.role == "admin", User.is_banned.isnot(True),
                                                User.id != report.reporter_id):
        alerts.append(notifications.create(
            db, recipient_id=int(admin_id), actor_id=int(admin_id), kind=KIND_MODERATION,
            message=message))
    return [a for a in alerts if a]


@router.post("", responses={400: {"description": "Reporting yourself"},
                            404: {"description": "Target not found"}})
@limiter.limit("10/hour")
def create_report(
    request: Request,
    data: ReportCreate,
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    comment = track = None
    target_id: int | None = None
    snapshot = None
    if data.target_type == "comment":
        comment = db.query(ScrobbleComment).filter(ScrobbleComment.id == data.comment_id).first()
        if not comment:
            raise HTTPException(404, "Комментарий не найден")
        target_id = int(comment.user_id)
    elif data.target_type == "track":
        track = db.query(Track).filter(Track.id == data.track_id).first()
        if not track:
            raise HTTPException(404, "Трек не найден")
        snapshot = _snapshot(title=track.title, artist=track.artist, album=track.album)
    else:
        target = db.query(User).filter(User.username == data.username).first()
        if not target:
            raise HTTPException(404, USER_NOT_FOUND)
        target_id = int(target.id)
        profile = target.profile
        snapshot = _snapshot(
            display_name=profile.display_name if profile else None,
            bio=profile.bio if profile else None,
            avatar_url=profile.avatar_url if profile else None,
            cover_url=profile.cover_url if profile else None,
            location=profile.location if profile else None)
    if target_id == user.id:
        raise HTTPException(400, "Нельзя пожаловаться на себя")

    # One open report per reporter and target is enough
    duplicate = db.query(Report.id).filter(Report.reporter_id == user.id, Report.status == "open",
                                           Report.target_type == data.target_type)
    if track is not None:
        duplicate = duplicate.filter(Report.track_id == track.id)
    elif comment is not None:
        duplicate = duplicate.filter(Report.comment_id == comment.id)
    else:
        duplicate = duplicate.filter(Report.target_user_id == target_id)
    if duplicate.first():
        return {"status": "already_reported"}

    report = Report(
        reporter_id=user.id,
        target_type=data.target_type,
        target_user_id=target_id,
        comment_id=comment.id if comment else None,
        track_id=track.id if track else None,
        comment_text=str(comment.content or "")[:500] if comment else None,
        target_snapshot=snapshot,
        reason=data.reason,
        details=sanitize_text(data.details.strip()) if data.details and data.details.strip() else None,
        status="open",
    )
    db.add(report)
    db.flush()
    alerts = _alert_moderators(db, report)
    db.commit()
    for alert in alerts:
        notifications.schedule_push(background_tasks, alert)
    return {"status": "ok"}
