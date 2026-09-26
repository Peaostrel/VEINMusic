"""Async Background Worker Queue (ARQ / Redis Task Runner)."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, ClassVar, Optional

from arq import cron
from arq.connections import RedisSettings

from app.core.observability import setup_observability
from app.database import SessionLocal
from app.services.achievements import (
    award_achievements_for_user,
    notify_achievements_unlocked,
)
from app.services.external_sync import dispatch_external_exports
from app.services.webhooks import dispatch_webhook_event

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


async def check_achievements(ctx: dict[str, Any], user_id: int) -> None:
    """ARQ background job to check and award auto-achievements for a user."""
    try:
        awarded = await asyncio.to_thread(award_achievements_for_user, user_id)
        await notify_achievements_unlocked(user_id, awarded)
    except Exception as e:
        logger.warning(f"[Worker] Error checking achievements for user {user_id}: {e}")


async def async_dispatch_webhook(
    ctx: dict[str, Any],
    event_name: str,
    data: dict[str, Any],
    user_id: int,
) -> None:
    """ARQ background job to dispatch webhook events."""
    db = SessionLocal()
    try:
        await dispatch_webhook_event(event_name, data, user_id, db)
    except Exception as e:
        logger.warning(f"[Worker] Webhook dispatch error: {e}")
    finally:
        db.close()


async def async_export_scrobble(
    ctx: dict[str, Any],
    user_id: int,
    artist: str,
    title: str,
    album: Optional[str],
    timestamp: int,
) -> None:
    """ARQ background job to export scrobbles to Last.fm / ListenBrainz / Libre.fm."""
    db = SessionLocal()
    try:
        await dispatch_external_exports(user_id, artist, title, album, timestamp, db)
    except Exception as e:
        logger.warning(f"[Worker] External export error: {e}")
    finally:
        db.close()


async def import_lastfm(ctx: dict[str, Any], job_id: int) -> None:
    """ARQ job: import (or resume importing) Last.fm history for one job."""
    from app.services.lastfm_import import run_import_job
    await run_import_job(job_id)


async def send_social_push(ctx: dict[str, Any], notification_id: int) -> None:
    """ARQ job: deliver a like/comment/follow notification as Web Push."""
    from app.services.notifications import send_social_push as deliver
    await deliver(notification_id)


def _cleanup_uploads_sync() -> int:
    from app.routers.media import UPLOADS_DIR
    from app.services.uploads_cleanup import cleanup_orphan_uploads
    db = SessionLocal()
    try:
        return cleanup_orphan_uploads(db, UPLOADS_DIR)
    finally:
        db.close()


async def cleanup_uploads(ctx: dict[str, Any]) -> None:
    """arq cron job: delete uploaded images nothing refers to any more."""
    try:
        await asyncio.to_thread(_cleanup_uploads_sync)
    except Exception as e:
        logger.warning(f"[Worker] Upload cleanup failed: {e}")


async def cloud_poll(ctx: dict[str, Any]) -> None:
    """arq cron job: poll Spotify / Yandex for currently playing tracks."""
    from app.services.cloud_scrobbling import poll_once
    from app.services.scrobble_processor import process_scrobble
    await poll_once(process_scrobble)


async def startup(ctx: dict[str, Any]) -> None:
    setup_observability("worker")
    await asyncio.sleep(0)
    logger.info("🚀 ARQ background worker initialized and ready for tasks.")


async def shutdown(ctx: dict[str, Any]) -> None:
    await asyncio.sleep(0)
    logger.info("🛑 ARQ background worker shut down cleanly.")


class WorkerSettings:
    functions: ClassVar[list] = [
        check_achievements,
        async_dispatch_webhook,
        async_export_scrobble,
        import_lastfm,
        send_social_push,
    ]
    cron_jobs: ClassVar[list] = [
        # Every 30 seconds; poll_once itself takes a Redis lock, so several
        # workers never poll the same accounts concurrently.
        cron(cloud_poll, second={0, 30}, run_at_startup=True, unique=True, timeout=25),
        # Daily, at a quiet hour
        cron(cleanup_uploads, hour={4}, minute={17}, unique=True, timeout=600),
    ]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    on_startup = startup
    on_shutdown = shutdown
