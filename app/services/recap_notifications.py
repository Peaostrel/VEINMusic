"""Create opt-in weekly and monthly Wrapped reminders."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.database import SessionLocal
from app.models import Notification, User
from app.services.music_story import weekly_story
from app.services.notifications import KIND_RECAP, send_social_push
from app.services.user_preferences import get_preferences
from app.services.user_stats import get_user_timezone_offset


def create_due_recap_notifications(now: datetime | None = None) -> list[int]:
    """Create each due reminder once and return its notification IDs."""
    current = now or datetime.now(UTC)
    db = SessionLocal()
    created: list[int] = []
    try:
        users = db.query(User).filter(User.is_banned.isnot(True)).all()
        for user in users:
            offset = get_user_timezone_offset(
                user.profile.location if user.profile else ""
            )
            local_now = current + timedelta(hours=offset)
            if local_now.hour != 9:
                continue

            preferences = get_preferences(user.profile)
            channels = preferences.notifications
            if not (
                channels.in_app.weekly_digest
                or channels.push.weekly_digest
            ):
                continue

            messages: list[str] = []
            date_label = local_now.strftime("%d.%m.%Y")
            if preferences.wrapped.auto_weekly and local_now.weekday() == 0:
                messages.append(f"Недельные итоги за {date_label} готовы")
            if preferences.wrapped.auto_monthly and local_now.day == 1:
                messages.append(f"Месячные итоги за {date_label} готовы")

            for message in messages:
                exists = db.query(Notification.id).filter(
                    Notification.user_id == user.id,
                    Notification.kind == KIND_RECAP,
                    Notification.message.startswith(message),
                ).first()
                if exists:
                    continue
                notification_message = message
                if message.startswith("Недельные"):
                    narrative = weekly_story(user, db, current)["story"]
                    notification_message = f"{message}. {narrative}"
                # Notification.message is VARCHAR(200) in production PostgreSQL.
                if len(notification_message) > 200:
                    notification_message = notification_message[:197] + "..."
                notification = Notification(
                    user_id=user.id,
                    actor_id=user.id,
                    kind=KIND_RECAP,
                    message=notification_message,
                    created_at=current,
                )
                db.add(notification)
                db.flush()
                created.append(int(notification.id))
        db.commit()
        return created
    finally:
        db.close()


async def send_due_recap_notifications() -> int:
    """Hourly worker entry point; local-time checks decide who is due."""
    import asyncio

    notification_ids = await asyncio.to_thread(create_due_recap_notifications)
    for notification_id in notification_ids:
        await send_social_push(notification_id)
    return len(notification_ids)
