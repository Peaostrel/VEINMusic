"""Serve partner artwork through VEIN when the upstream forbids embedding,
and pictures from arbitrary hosts through VEIN so they can't log viewers' IPs."""
import hashlib
import hmac
import os
import re
from urllib.parse import quote, urlsplit

from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

PLAT_COVER_PATH = r"(albums|artists)/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)"


# Music services' own image CDNs are shown directly; any other host could be a
# server of whoever set the picture, so it is fetched by VEIN instead.
DIRECT_IMAGE_HOSTS = (
    "avatars.yandex.net", "avatars.mds.yandex.net", "scdn.co", "spotifycdn.com",
    "ytimg.com", "googleusercontent.com", "ggpht.com", "sndcdn.com", "userapi.com",
    "vkuserphoto.ru", "vk.com", "vk.ru", "mzstatic.com", "zvuk.com", "lastfm.freetls.fastly.net",
    "coverartarchive.org", "archive.org", "dzcdn.net",
)


def _api_base() -> str:
    return os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")


def _own_hosts() -> set[str]:
    hosts = {urlsplit(_api_base()).hostname}
    for name in ("FRONTEND_URL", "SITE_URL"):
        if os.getenv(name):
            hosts.add(urlsplit(os.environ[name]).hostname)
    return {host for host in hosts if host}


def image_signature(url: str) -> str:
    from app.core.security import SECRET_KEY
    return hmac.new(SECRET_KEY.encode(), f"image-proxy:{url}".encode(), hashlib.sha256).hexdigest()[:32]


def proxied_image_url(value: str | None) -> str | None:
    """A picture URL safe to show to other people; applied when a user or a
    client sets one, so stored pictures never point at an unknown server."""
    if not value or not value.startswith(("http://", "https://")):
        return value
    host = (urlsplit(value).hostname or "").lower()
    if value.startswith("https://") and (host in _own_hosts() or any(
            host == domain or host.endswith("." + domain) for domain in DIRECT_IMAGE_HOSTS)):
        return value
    return f"{_api_base()}/api/media/image?url={quote(value, safe='')}&sig={image_signature(value)}"


def public_cover_url(value: str | None) -> str | None:
    if not value or not value.startswith("https://plat-music.ru/"):
        return value
    parts = urlsplit(value)
    prefix = "/api/media/covers/"
    path = parts.path.removeprefix(prefix)
    if not parts.path.startswith(prefix) or not re.fullmatch(PLAT_COVER_PATH, path):
        return value
    return f"{_api_base()}/api/media/plat-covers/{path}"


class TrackCoverURL(TypeDecorator):
    """Keep original strings in SQL; expose browser-usable URLs when read.

    Existing catalog rows benefit too, without rewriting their metadata.
    The SQL type is unchanged, so this needs no schema migration.
    """
    impl = String
    cache_ok = True

    def process_result_value(self, value, dialect):
        return public_cover_url(value)
