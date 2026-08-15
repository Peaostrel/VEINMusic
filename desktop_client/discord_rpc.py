"""Discord Rich Presence client for VEINMusic desktop listener."""
from __future__ import annotations

import time
from typing import Optional

DISCORD_CLIENT_ID = "1503812613052694658"  # VEINMusic Discord App ID


class DiscordRPCManager:
    """Manages Discord Rich Presence status."""

    def __init__(self, client_id: str = DISCORD_CLIENT_ID):
        self.client_id = client_id
        self._rpc = None
        self._connected = False
        self._last_state: Optional[str] = None

    def connect(self) -> bool:
        """Attempt connection to Discord RPC."""
        try:
            from pypresence import Presence  # type: ignore[import-untyped]

            self._rpc = Presence(self.client_id)
            self._rpc.connect()
            self._connected = True
            print("[Discord RPC] 🎮 Connected to Discord Rich Presence.")
            return True
        except Exception:
            self._connected = False
            return False

    def update_presence(
        self,
        title: str,
        artist: str,
        album: str = "",
        username: str = "",
        duration_sec: int = 0,
        is_playing: bool = True,
    ) -> None:
        """Update Discord Rich Presence state."""
        state_key = f"{artist}:{title}:{is_playing}"
        if state_key == self._last_state:
            return

        if not self._connected and not self.connect():
            return

        try:
            buttons = []
            if username:
                buttons.append({"label": "VEIN Profile", "url": f"https://music.vein.guru/user/{username}"})
            else:
                buttons.append({"label": "VEIN Music", "url": "https://music.vein.guru"})

            start_time = int(time.time()) if is_playing else None
            end_time = (start_time + duration_sec) if (is_playing and duration_sec > 0) else None

            if self._rpc:
                self._rpc.update(
                    state=f"by {artist[:64]}",
                    details=f"🎵 {title[:64]}",
                    large_image="vein_logo",
                    large_text=f"VEINMusic - {album or 'Listening to music'}",
                    small_image="play" if is_playing else "pause",
                    small_text="Playing" if is_playing else "Paused",
                    start=start_time,
                    end=end_time,
                    buttons=buttons[:2],
                )
            self._last_state = state_key
        except Exception:
            self._connected = False

    def clear(self) -> None:
        """Clear Discord status."""
        if self._connected and self._rpc:
            try:
                self._rpc.clear()
            except Exception:
                pass
        self._last_state = None

    def close(self) -> None:
        if self._connected and self._rpc:
            try:
                self._rpc.close()
            except Exception:
                pass
            self._connected = False
