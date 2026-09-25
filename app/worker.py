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
from app.models import User
from app.services.achievements import check_auto_achievements
from app.services.external_sync import dispatch_external_exports
from app.services.webhooks import dispatch_webhook_event

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


def _sync_check_achievements(user_id: int) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            check_auto_achievements(user, db)
    except Exception as e:
        logger.warning(f"[Worker] Error checking achievements for user {user_id}: {e}")
    finally:
        db.close()


async def check_achievements(ctx: dict[str, Any], user_id: int) -> None:
    """ARQ background job to check and award auto-achievements for a user."""
    await asyncio.to_thread(_sync_check_achievements, user_id)


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
    ]
    cron_jobs: ClassVar[list] = [
        # Every 30 seconds; poll_once itself takes a Redis lock, so several
        # workers never poll the same accounts concurrently.
        cron(cloud_poll, second={0, 30}, run_at_startup=True, unique=True, timeout=25),
    ]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    on_startup = startup
    on_shutdown = shutdown
