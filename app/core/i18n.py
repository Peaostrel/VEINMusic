"""Language of texts the API writes itself: emails, push and in-app
notifications, recaps and stories, labels inside responses.

Russian is the source text and the key of app/i18n/en/*.json, so a missing
translation falls back to Russian. The site sends its language in the
X-VEIN-Lang header; a signed-in user's choice is also stored in users.lang
for what is sent while they are away (emails, push, notifications).
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from fastapi import Request

LANGS = ("ru", "en")
DEFAULT_LANG = "ru"
LANG_HEADER = "X-VEIN-Lang"
# Browsers asking for one of these get Russian, everyone else English
RUSSIAN_SPEAKING = {"ru", "uk", "be", "kk", "ky", "uz", "tg", "hy", "az"}

_DICT_DIR = Path(__file__).resolve().parent.parent / "i18n" / "en"
_VAR = re.compile(r"\{(\w+)\}")


@lru_cache(maxsize=1)
def _english() -> dict[str, str]:
    english: dict[str, str] = {}
    for path in sorted(_DICT_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as fh:
            english.update(json.load(fh))
    return english


def normalize_lang(value: object) -> str | None:
    return value if isinstance(value, str) and value in LANGS else None


def lang_from_accept(header: str | None) -> str | None:
    """'en-GB,en;q=0.9' → 'en'; 'ru-RU,ru' → 'ru'; nothing → None."""
    if not header:
        return None
    first = header.split(",")[0].split(";")[0].strip().lower()
    if not first or first == "*":
        return None
    return "ru" if first.split("-")[0] in RUSSIAN_SPEAKING else "en"


def request_lang(request: Request | None, user=None) -> str:
    """The language to answer in: the site's header, the user's saved
    choice, the browser's Accept-Language, else Russian."""
    if request is not None:
        chosen = normalize_lang(request.headers.get(LANG_HEADER))
        if chosen:
            return chosen
    saved = normalize_lang(getattr(user, "lang", None))
    if saved:
        return saved
    if request is not None:
        return lang_from_accept(request.headers.get("accept-language")) or DEFAULT_LANG
    return DEFAULT_LANG


def user_lang(user) -> str:
    """Language for texts sent to a user who is not looking (email, push)."""
    return normalize_lang(getattr(user, "lang", None)) or DEFAULT_LANG


def tr(lang: str, ru: str, **values) -> str:
    """tr("en", "Новых: {n}", n=3) → "New: 3"; Russian when untranslated."""
    text = _english().get(ru, ru) if lang == "en" else ru
    if not values:
        return text
    return _VAR.sub(lambda m: str(values.get(m.group(1), m.group(0))), text)


def plural(lang: str, n: int, one: str, few: str, many: str) -> str:
    """Word for a count; English forms are the entry "one|few|many" → "x|xs"."""
    if lang == "en":
        english = _english().get(f"{one}|{few}|{many}")
        if english:
            single, _, multiple = english.partition("|")
            return single if abs(n) == 1 else (multiple or single)
    m10, m100 = abs(n) % 10, abs(n) % 100
    if m10 == 1 and m100 != 11:
        return one
    if 2 <= m10 <= 4 and not 12 <= m100 <= 14:
        return few
    return many
