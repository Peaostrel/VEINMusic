"""Explain the current counting rule without changing credit semantics."""
from datetime import UTC, datetime
from app.core.constants import ACTIVE_PLAYBACK_WINDOW_SEC


def listen_status(listen, track):
    duration = int(track.duration or 180)
    listened = int(listen.listened_sec or 0)
    updated = listen.updated_at or listen.played_at
    updated = updated.replace(tzinfo=UTC) if updated.tzinfo is None else updated
    if listen.excluded_from_stats:
        code, label = "excluded", "Исключено из статистики"
    elif listen.is_imported:
        code, label = "imported", "Импортировано"
    elif listened * 100 >= duration * 85:
        code, label = "counted", "Засчитано"
    elif listen.is_playing and (datetime.now(UTC) - updated).total_seconds() < ACTIVE_PLAYBACK_WINDOW_SEC:
        code, label = "playing", "Ещё играет"
    else:
        code, label = "too_short", "Недостаточно времени для зачёта"
    return {"code": code, "label": label, "required_sec": (duration * 85 + 99) // 100,
            "listened_sec": listened, "explanation": "Для зачёта нужно подтвердить 85% длительности. Импорт хранится отдельно от живого прослушивания."}
