"""External Scrobble Exporter Service for Last.fm, ListenBrainz, and Libre.fm."""
from __future__ import annotations

import hashlib
import os
import time
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.models import ExternalSyncConfig

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY", "")
LASTFM_SHARED_SIGNING_SALT = os.getenv("LASTFM_API_SECRET", "")
LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/"
LIBREFM_API_URL = "https://libre.fm/2.0/"
LISTENBRAINZ_API_URL = "https://api.listenbrainz.org/1/submit-listens"


def _generate_lastfm_signature(params: dict[str, str], signing_suffix: str) -> str:
    """Generate Last.fm API method signature (MD5 of sorted key-value pairs + protocol suffix)."""
    sorted_keys = sorted(params.keys())
    payload_str = "".join(f"{k}{params[k]}" for k in sorted_keys) + signing_suffix
    # Protocol-mandated AudioScrobbler 2.0 checksum calculation
    hasher = hashlib.new("md5", usedforsecurity=False)  # NOSONAR
    hasher.update(payload_str.encode("utf-8"))
    return hasher.hexdigest()


async def export_to_lastfm(
    session_key: str,
    artist: str,
    title: str,
    album: Optional[str] = None,
    timestamp: Optional[int] = None,
    api_key: str = LASTFM_API_KEY,
    api_sig_key: str = LASTFM_SHARED_SIGNING_SALT,
) -> bool:
    """Export scrobble to Last.fm."""
    if not session_key or not api_key or not api_sig_key:
        return False

    ts = str(timestamp or int(time.time()))
    params: dict[str, str] = {
        "method": "track.scrobble",
        "api_key": api_key,
        "sk": session_key,
        "artist": artist,
        "track": title,
        "timestamp": ts,
    }
    if album:
        params["album"] = album

    params["api_sig"] = _generate_lastfm_signature(params, api_sig_key)
    params["format"] = "json"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(LASTFM_API_URL, data=params)
            if res.is_success:
                data = res.json()
                scrobbles = data.get("scrobbles", {})
                return "@attr" in scrobbles and int(scrobbles["@attr"].get("accepted", 0)) > 0
    except Exception as e:
        print(f"[ExternalSync] Last.fm export error: {e}")
    return False


async def export_to_librefm(
    session_key: str,
    artist: str,
    title: str,
    album: Optional[str] = None,
    timestamp: Optional[int] = None,
) -> bool:
    """Export scrobble to Libre.fm (GNU FM protocol)."""
    if not session_key:
        return False

    ts = str(timestamp or int(time.time()))
    params: dict[str, str] = {
        "method": "track.scrobble",
        "sk": session_key,
        "artist": artist,
        "track": title,
        "timestamp": ts,
        "format": "json",
    }
    if album:
        params["album"] = album

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(LIBREFM_API_URL, data=params)
            return res.is_success
    except Exception as e:
        print(f"[ExternalSync] Libre.fm export error: {e}")
    return False


async def export_to_listenbrainz(
    user_token: str,
    artist: str,
    title: str,
    album: Optional[str] = None,
    timestamp: Optional[int] = None,
) -> bool:
    """Export listen to ListenBrainz (MetaBrainz Foundation API)."""
    if not user_token:
        return False

    ts = timestamp or int(time.time())
    payload = {
        "listen_type": "single",
        "payload": [
            {
                "listened_at": ts,
                "track_metadata": {
                    "artist_name": artist,
                    "track_name": title,
                    "release_name": album or "",
                },
            }
        ],
    }

    headers = {
        "Authorization": f"Token {user_token}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(LISTENBRAINZ_API_URL, json=payload, headers=headers)
            return res.is_success
    except Exception as e:
        print(f"[ExternalSync] ListenBrainz export error: {e}")
    return False


async def dispatch_external_exports(
    user_id: int,
    artist: str,
    title: str,
    album: Optional[str],
    timestamp: int,
    db: Session,
) -> None:
    """Dispatch scrobble to all enabled external platforms configured for the user."""
    config = db.query(ExternalSyncConfig).filter(ExternalSyncConfig.user_id == user_id).first()
    if not config:
        return

    if config.is_lastfm_enabled and config.lastfm_session_key:
        await export_to_lastfm(str(config.lastfm_session_key), artist, title, album, timestamp)

    if config.is_listenbrainz_enabled and config.listenbrainz_token:
        await export_to_listenbrainz(str(config.listenbrainz_token), artist, title, album, timestamp)

    if config.is_librefm_enabled and config.librefm_session_key:
        await export_to_librefm(str(config.librefm_session_key), artist, title, album, timestamp)
