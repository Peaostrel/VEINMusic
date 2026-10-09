"""Sanitized, bounded connection diagnostics."""
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError

from app.models import SourceHealth

SOURCES = ("spotify", "yandex", "youtube", "soundcloud", "lastfm", "extension")
ERRORS = {"token_expired", "network_error", "provider_error"}
MESSAGES = {
    "token_expired": "Доступ истёк. Переподключите аккаунт в настройках интеграций.",
    "network_error": "Источник временно недоступен. Повторите синхронизацию позже.",
    "provider_error": "Музыкальный сервис отклонил запрос. Повторите синхронизацию.",
    "short_track_ignored": "Короткий трек исключён настройками прослушивания.",
    "source_ignored": "Источник исключён настройками прослушивания.",
    "artist_ignored": "Исполнитель исключён настройками прослушивания.",
    "track_ignored": "Трек исключён настройками прослушивания.",
    "private_session": "Включена приватная сессия. Прослушивания не записываются.",
    "integration_paused": "Синхронизация приостановлена. Проверьте настройки интеграций.",
    "blacklisted": "Трек исключён правилами сервиса.",
    "ignored_spam_protection": "Повторное событие слишком близко к предыдущему.",
    "ok": "Событие получено. Для зачёта прослушайте не менее 85% трека.",
}


def source_key(source):
    name = (source or "").casefold()
    return next((key for key in SOURCES if key in name), "extension")


def record_health(db, user_id, source, status, processing_ms=0):
    """Use a savepoint so concurrent first events cannot break a scrobble."""
    key = source_key(source)
    row = db.query(SourceHealth).filter_by(user_id=user_id, source=key).first()
    if row is None:
        try:
            with db.begin_nested():
                row = SourceHealth(user_id=user_id, source=key, status=status, received_at=datetime.now(UTC))
                db.add(row)
                db.flush()
        except IntegrityError:
            row = db.query(SourceHealth).filter_by(user_id=user_id, source=key).one()
    now = datetime.now(UTC)
    row.status = status
    row.received_at = now
    row.received_count = SourceHealth.received_count + 1
    row.error_count = SourceHealth.error_count + int(status in ERRORS)
    row.processing_ms = max(0, min(int(processing_ms), 600000))
    if status == "ok":
        row.last_success_at = now
        if row.first_success_at is None:
            row.first_success_at = now
    db.commit()
