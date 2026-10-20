"""Interface language of the desktop client.

Russian on Russian-speaking systems (ru, uk, be, kk), English otherwise.
Windows: the user's UI language (GetUserDefaultUILanguage). Elsewhere:
LC_ALL / LC_MESSAGES / LANG, then locale.getlocale().
"""
from __future__ import annotations

import locale
import os
import sys
from functools import lru_cache
from typing import Optional

RUSSIAN_SPEAKING = ("ru", "uk", "be", "kk")
# Windows locale names as locale.getlocale() reports them ("Russian_Russia")
_WINDOWS_NAMES = {"russian": "ru", "ukrainian": "uk", "belarusian": "be", "kazakh": "kk"}
# Primary language ids (LANGID & 0x3ff) of the same languages
_WINDOWS_LANGIDS = (0x19, 0x22, 0x23, 0x3F)


def is_russian_code(code: Optional[str]) -> bool:
    """Whether a locale such as "ru_RU.UTF-8", "uk-UA" or "Russian_Russia" is Russian-speaking."""
    if not code:
        return False
    primary = code.replace("-", "_").split(".")[0].split("@")[0].split("_")[0].lower()
    primary = _WINDOWS_NAMES.get(primary, primary)
    return primary in RUSSIAN_SPEAKING


def _windows_ui_is_russian() -> Optional[bool]:
    try:
        import ctypes

        langid = ctypes.windll.kernel32.GetUserDefaultUILanguage()  # type: ignore[attr-defined]
    except Exception:
        return None
    return (langid & 0x3FF) in _WINDOWS_LANGIDS


@lru_cache(maxsize=1)
def is_russian() -> bool:
    if sys.platform == "win32":
        answer = _windows_ui_is_russian()
        if answer is not None:
            return answer
    for name in ("LC_ALL", "LC_MESSAGES", "LANG"):
        value = os.environ.get(name)
        if value:
            return is_russian_code(value)
    try:
        return is_russian_code(locale.getlocale()[0])
    except ValueError:
        return False


def tr(ru: str, en: str) -> str:
    """The Russian or the English text."""
    return ru if is_russian() else en
