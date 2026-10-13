"""Serve partner artwork through VEIN when the upstream forbids embedding."""
import os
import re
from urllib.parse import urlsplit

from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

PLAT_COVER_PATH = r"(albums|artists)/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)"


def public_cover_url(value: str | None) -> str | None:
    if not value or not value.startswith("https://plat-music.ru/"):
        return value
    parts = urlsplit(value)
    prefix = "/api/media/covers/"
    path = parts.path.removeprefix(prefix)
    if not parts.path.startswith(prefix) or not re.fullmatch(PLAT_COVER_PATH, path):
        return value
    base = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
    return f"{base}/api/media/plat-covers/{path}"


class TrackCoverURL(TypeDecorator):
    """Keep original strings in SQL; expose browser-usable URLs when read.

    Existing catalog rows benefit too, without rewriting their metadata.
    The SQL type is unchanged, so this needs no schema migration.
    """
    impl = String
    cache_ok = True

    def process_result_value(self, value, dialect):
        return public_cover_url(value)
