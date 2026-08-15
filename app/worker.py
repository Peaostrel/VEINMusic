"""Async Background Worker Queue (ARQ / Redis Task Runner)."""
from __future__ import annotations

import asyncio
import os
from typing import Any, ClassVar, Optional

from arq.connections import RedisSettings

from app.database import SessionLocal
from app.models import User
from app.routers.extended import check_auto_achievements
from app.services.external_sync import dispatch_external_exports
from app.services.webhooks import dispatch_webhook_event

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


def _sync_check_achievements(user_id: int) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            check_auto_achievements(user, db)
    except Exception as e:
        print(f"[Worker] Error checking achievements for user {user_id}: {e}")
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
        print(f"[Worker] Webhook dispatch error: {e}")
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
        print(f"[Worker] External export error: {e}")
    finally:
        db.close()


async def startup(ctx: dict[str, Any]) -> None:
    await asyncio.sleep(0)
    print("🚀 ARQ background worker initialized and ready for tasks.")


async def shutdown(ctx: dict[str, Any]) -> None:
    await asyncio.sleep(0)
    print("🛑 ARQ background worker shut down cleanly.")


class WorkerSettings:
    functions: ClassVar[list] = [
        check_achievements,
        async_dispatch_webhook,
        async_export_scrobble,
    ]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    on_startup = startup
    on_shutdown = shutdown
