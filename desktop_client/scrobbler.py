"""Scrobble and Now-Playing dispatcher with offline buffer queue."""
from __future__ import annotations

import json
import time
from typing import Any

import httpx

from desktop_client.config import CONFIG_DIR

QUEUE_FILE = CONFIG_DIR / "queue.json"


class DesktopScrobbler:
    """Manages scrobbling, now-playing updates, and offline queuing."""

    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.queue: list[dict[str, Any]] = self._load_queue()
        self._last_now_playing_track: str = ""

    def _load_queue(self) -> list[dict[str, Any]]:
        if not QUEUE_FILE.exists():
            return []
        try:
            with open(QUEUE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception:
            return []

    def _save_queue(self) -> None:
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            with open(QUEUE_FILE, "w", encoding="utf-8") as f:
                json.dump(self.queue, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[Scrobbler] Error saving offline queue: {e}")

    def update_credentials(self, api_url: str, api_key: str) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key

    def _get_headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "VEINMusic-Desktop/2.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["X-API-Key"] = self.api_key
        return headers

    def send_now_playing(self, title: str, artist: str, album: str = "", duration: int = 0, source: str = "desktop") -> bool:
        """Send Now Playing update to VEINMusic API."""
        if not self.api_key:
            return False

        track_key = f"{artist} - {title}"
        if self._last_now_playing_track == track_key:
            return True
        self._last_now_playing_track = track_key

        payload = {
            "title": title,
            "artist": artist,
            "album": album,
            "duration": duration,
            "source": source,
            "is_playing": True,
            "listened_sec": 0,
        }

        try:
            with httpx.Client(timeout=4.0) as client:
                res = client.post(f"{self.api_url}/api/scrobble", json=payload, headers=self._get_headers())
                if res.is_success:
                    print(f"[Scrobbler] 🎵 Now Playing: {artist} - {title}")
                    return True
        except Exception as e:
            print(f"[Scrobbler] Now Playing network error: {e}")
        return False

    def scrobble(self, title: str, artist: str, album: str = "", duration: int = 0, source: str = "desktop", listened_sec: int = 0) -> bool:
        """Send finalized scrobble to VEINMusic API or buffer to offline queue."""
        if not title or not artist:
            return False

        payload = {
            "title": title,
            "artist": artist,
            "album": album,
            "duration": duration,
            "source": source,
            "is_playing": False,
            "listened_sec": listened_sec or duration,
            "timestamp": int(time.time()),
        }

        if not self.api_key:
            print("[Scrobbler] Warning: No API key configured. Buffering scrobble locally.")
            self.queue.append(payload)
            self._save_queue()
            return False

        # Try online scrobble
        try:
            with httpx.Client(timeout=6.0) as client:
                res = client.post(f"{self.api_url}/api/scrobble", json=payload, headers=self._get_headers())
                if res.is_success:
                    print(f"[Scrobbler] ✅ Scrobbled: {artist} - {title}")
                    # Try to flush any offline items
                    self.flush_queue()
                    return True
                elif res.status_code >= 500:
                    print(f"[Scrobbler] Server error ({res.status_code}), buffering offline.")
                    self.queue.append(payload)
                    self._save_queue()
                    return False
        except Exception as e:
            print(f"[Scrobbler] Network error ({e}), saving to offline queue.")
            self.queue.append(payload)
            self._save_queue()
            return False

        return False

    def flush_queue(self) -> int:
        """Attempt to drain offline scrobbles."""
        if not self.queue or not self.api_key:
            return 0

        print(f"[Scrobbler] Flushing {len(self.queue)} offline scrobbles...")
        flushed = 0
        remaining: list[dict[str, Any]] = []

        with httpx.Client(timeout=6.0) as client:
            for item in self.queue:
                try:
                    res = client.post(f"{self.api_url}/api/scrobble", json=item, headers=self._get_headers())
                    if res.is_success:
                        flushed += 1
                    else:
                        remaining.append(item)
                except Exception:
                    remaining.append(item)

        self.queue = remaining
        self._save_queue()
        if flushed > 0:
            print(f"[Scrobbler] 🎉 Successfully synced {flushed} offline scrobbles.")
        return flushed
