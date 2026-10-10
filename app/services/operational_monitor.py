"""Local operational checks; no credentials or user tracks enter alerts."""
import os
import asyncio
import shutil
from datetime import UTC, datetime
from pathlib import Path

from app.models import HistoryChange, Scrobble, UserSession
from app.services.system_status import backups_status


def file_age(path):
    try:
        return max(0, (datetime.now(UTC).timestamp() - Path(path).stat().st_mtime) / 3600)
    except OSError:
        return None


def evaluate(snapshot):
    alerts = []

    def add(code, message):
        alerts.append({"code": code, "message": message})
    worker = snapshot["worker"]
    if not worker.get("redis"):
        add("redis", "Redis недоступен: очередь и фоновые задачи не работают")
    if worker.get("queued_jobs") is not None and worker["queued_jobs"] >= 500:
        add("queue", "В очереди накопилось 500 или больше задач")
    if (worker.get("oldest_ready_age_minutes") or 0) > 15:
        add("queue_age", "Задача ожидает или выполняется больше 15 минут. Проверьте очередь и длительные импорты")
    age = snapshot.get("poll_age_minutes")
    if age is None or age > 3:
        add("cloud_poll", "Опрос музыкальных сервисов не завершался больше трёх минут")
    latest = snapshot["backups"].get("latest")
    if not latest or latest["age_hours"] > 30:
        add("backup", "Нет свежей локальной копии базы за последние 30 часов")
    offsite = snapshot["offsite"]
    if offsite["configured"] and (offsite["age_hours"] is None or offsite["age_hours"] > 30):
        add("offsite", "Внешний бэкап не подтверждён за последние 30 часов")
    for source in snapshot.get("source_errors", []):
        add(f"source:{source}", f"Ошибки получения прослушиваний: {source}")
    if (snapshot.get("disk_used_percent") or 0) >= 90:
        add("disk", "Диск заполнен на 90% или больше")
    return alerts


def source_errors():
    from datetime import timedelta
    from app.database import SessionLocal
    from app.models import SourceHealth, User
    db = SessionLocal()
    try:
        rows = db.query(SourceHealth.source).join(User, User.id == SourceHealth.user_id).filter(
            User.is_banned.isnot(True), SourceHealth.status.in_(["network_error", "provider_error", "token_expired"]),
            SourceHealth.received_at > datetime.now(UTC) - timedelta(minutes=10)).distinct().all()
        return [str(row[0]) for row in rows]
    except Exception:
        return []  # The API database health check reports a database outage.
    finally:
        db.close()


async def snapshot():
    from app.services.system_status import worker_status
    worker = await worker_status()
    stamp = worker.get("cron", {}).get("cloud_poll")
    try:
        stamp = stamp.decode() if isinstance(stamp, bytes) else stamp
        parsed = datetime.fromisoformat(stamp)
        parsed = parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed
        poll_age = max(0, (datetime.now(UTC) - parsed).total_seconds() / 60)
    except (TypeError, ValueError):
        poll_age = None
    path = os.getenv("BACKUP_DIR", "/backups")
    try:
        usage = shutil.disk_usage(path)
        used = round(100 * usage.used / usage.total, 1)
    except OSError:
        used = None
    errors = await asyncio.to_thread(source_errors)
    result = {"source_errors": errors, "worker": worker, "poll_age_minutes": poll_age, "backups": backups_status(path),
              "disk_used_percent": used,
              "offsite": {"configured": os.getenv("OFFSITE_BACKUP_ENABLED", "0") == "1",
                          "age_hours": file_age(os.getenv("OFFSITE_STATUS_FILE", "/backup-status/offsite-last-success")),
                          "note": "Успешная отправка не заменяет проверку восстановления из копии."}}
    result["alerts"] = evaluate(result)
    return result


def purge_expired(db):
    from datetime import timedelta
    now = datetime.now(UTC)
    db.query(Scrobble).filter(Scrobble.deleted_at < now - timedelta(hours=24)).delete(synchronize_session=False)
    db.query(HistoryChange).filter(HistoryChange.expires_at < now).delete(synchronize_session=False)
    db.query(UserSession).filter(UserSession.expires_at < now).delete(synchronize_session=False)
    db.commit()
