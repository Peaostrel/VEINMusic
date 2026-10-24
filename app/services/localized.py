"""Response texts built from values (dates, times, counts) in the language of
the visitor making the request; fixed texts go through app.core.i18n.tr."""

from datetime import UTC, date, datetime

RU_MONTHS_SHORT = ("янв", "фев", "мар", "апр", "мая", "июн",
                   "июл", "авг", "сен", "окт", "ноя", "дек")
EN_MONTHS_SHORT = ("Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def short_date(value: date, lang: str) -> str:
    """'12 мая' / 'May 12'."""
    if lang == "en":
        return f"{EN_MONTHS_SHORT[value.month - 1]} {value.day}"
    return f"{value.day} {RU_MONTHS_SHORT[value.month - 1]}"


def full_date(value: date, lang: str) -> str:
    """'12.05.2026' / 'May 12, 2026'."""
    if lang == "en":
        return f"{EN_MONTHS_SHORT[value.month - 1]} {value.day}, {value.year}"
    return value.strftime("%d.%m.%Y")


def date_range(first: date, last: date, lang: str) -> str:
    """'01.05.2026 — 12.05.2026' / 'May 1, 2026 – May 12, 2026'."""
    if lang == "en":
        return f"{full_date(first, lang)} – {full_date(last, lang)}"
    return f"{full_date(first, lang)} — {full_date(last, lang)}"


def relative_time(moment: datetime, lang: str, now: datetime | None = None) -> str:
    """'только что', '5м назад', '3ч назад', '12 мая' (or English)."""
    moment = _aware(moment)
    seconds = ((now or datetime.now(UTC)) - moment).total_seconds()
    english = lang == "en"
    if seconds < 60:
        return "just now" if english else "только что"
    if seconds < 3600:
        minutes = int(seconds // 60)
        return f"{minutes}m ago" if english else f"{minutes}м назад"
    if seconds < 86400:
        hours = int(seconds // 3600)
        return f"{hours}h ago" if english else f"{hours}ч назад"
    if moment.year != (now or datetime.now(UTC)).year:  # imported history goes back years
        return f"{short_date(moment, lang)}, {moment.year}" if english else f"{short_date(moment, lang)} {moment.year}"
    return short_date(moment, lang)


def localize_history_items(items: list[dict], lang: str) -> list[dict]:
    """Rewrite relative_time of formatted (possibly cached) history items."""
    if lang != "en":
        return items
    result = []
    for item in items:
        try:
            moment = datetime.fromisoformat(str(item.get("time")))
        except (TypeError, ValueError):
            result.append(item)
            continue
        result.append({**item, "relative_time": relative_time(moment, lang)})
    return result


_COLLECTOR_EN = {"клиент": "client", "облако": "cloud", "живое подключение": "live connection"}


def source_label(label: str, lang: str) -> str:
    """'yandex · облако' (as stored in confirmed_sources) → 'yandex · cloud'."""
    if lang != "en" or not isinstance(label, str):
        return label
    source, sep, collector = label.rpartition(" · ")
    if not sep:
        return label
    return f"{source}{sep}{_COLLECTOR_EN.get(collector, collector)}"
