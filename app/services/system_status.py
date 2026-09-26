"""Operational status for the admin panel: background worker, cron jobs,
backups, uploads and database size."""
from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

CRON_KEY_PREFIX = "cron:last:"
CRON_JOBS = ("cloud_poll", "cleanup_uploads")
ARQ_QUEUE_KEY = "arq:queue"
BACKUP_SUFFIX = ".dump"


def _dir_usage(path: str) -> dict[str, Any]:
    if not os.path.isdir(path):
        return {"available": False, "files": 0, "bytes": 0}
    files = total = 0
    for entry in os.scandir(path):
        if entry.is_file():
            files += 1
            total += entry.stat().st_size
    return {"available": True, "files": files, "bytes": total}


def backups_status(backup_dir: str) -> dict[str, Any]:
    """The dumps written by the db-backup service (mounted read-only)."""
    if not os.path.isdir(backup_dir):
        return {"available": False, "count": 0, "latest": None, "bytes": 0}
    dumps = [e for e in os.scandir(backup_dir) if e.is_file() and e.name.endswith(BACKUP_SUFFIX)]
    dumps.sort(key=lambda e: e.stat().st_mtime, reverse=True)
    latest = None
    if dumps:
        st = dumps[0].stat()
        created = datetime.fromtimestamp(st.st_mtime, UTC)
        latest = {"name": dumps[0].name, "bytes": st.st_size, "created_at": created.isoformat(),
                  "age_hours": round((datetime.now(UTC) - created).total_seconds() / 3600, 1)}
    return {"available": True, "count": len(dumps), "latest": latest,
            "bytes": sum(e.stat().st_size for e in dumps)}


def database_status(db: Session) -> dict[str, Any]:
    dialect = db.get_bind().dialect.name
    size = None
    if dialect == "postgresql":
        size = db.execute(text("SELECT pg_database_size(current_database())")).scalar()
    return {"dialect": dialect, "bytes": size}


async def worker_status() -> dict[str, Any]:
    """Queue length and last cron runs, from Redis (the worker's broker)."""
    from app.core.redis import get_redis_client
    try:
        client = get_redis_client()
        queued = await client.zcard(ARQ_QUEUE_KEY)
        last_runs = {job: await client.get(CRON_KEY_PREFIX + job) for job in CRON_JOBS}
    except Exception:
        return {"redis": False, "queued_jobs": None, "cron": dict.fromkeys(CRON_JOBS)}
    return {"redis": True, "queued_jobs": int(queued or 0), "cron": last_runs}


async def mark_cron_run(redis: Any, job: str) -> None:
    """Called by the worker when a cron job finishes."""
    try:
        await redis.set(CRON_KEY_PREFIX + job, datetime.now(UTC).isoformat())
    except Exception:  # status only: never fail the job for it
        return
