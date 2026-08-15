"""Cross-platform media session and player listener."""
from __future__ import annotations

import asyncio
import platform
import re
import subprocess
from dataclasses import dataclass
from typing import Optional

_SYSTEM = platform.system()


@dataclass
class MediaTrackInfo:
    title: str
    artist: str
    album: str = ""
    duration_sec: int = 0
    position_sec: int = 0
    player_name: str = "Media Player"
    is_playing: bool = True
    album_art_url: Optional[str] = None


class BaseMediaListener:
    """Base interface for OS media listeners."""

    async def get_current_track(self) -> Optional[MediaTrackInfo]:
        raise NotImplementedError


def _is_valid_music_session(app_id: str, title: str, artist: str) -> bool:
    app_low = (app_id or "").lower()
    title_low = (title or "").strip().lower()
    artist_low = (artist or "").strip().lower()

    if not title_low:
        return False

    # Block YouTube video noise in browsers
    youtube_signals = ["- youtube", "• youtube", "| youtube", "youtube music"]
    if any(s in title_low for s in youtube_signals) or artist_low.endswith(" - topic"):
        return False

    # Known music players or browsers
    is_music_app = any(k in app_low for k in ["yandex", "spotify", "aimp", "foobar", "vlc", "music", "itunes", "winamp", "vk"])
    is_browser = any(b in app_low for b in ["chrome", "edge", "firefox", "opera", "brave", "browser"]) or "308046b0af4a39cb" in app_low

    if not is_music_app and not is_browser:
        return False

    return True


class WindowsSMTCListener(BaseMediaListener):
    """Windows System Media Transport Controls (SMTC) listener using WinRT / winsdk."""

    def __init__(self):
        self._available = False
        self._manager = None
        if _SYSTEM == "Windows":
            try:
                # Try winsdk / winrt
                import winsdk.windows.media.control as wmc  # type: ignore[import-untyped]
                self._wmc = wmc
                self._available = True
            except ImportError:
                try:
                    import winrt.windows.media.control as wmc  # type: ignore[import-untyped]
                    self._wmc = wmc
                    self._available = True
                except ImportError:
                    self._available = False

    async def get_current_track(self) -> Optional[MediaTrackInfo]:
        if not self._available:
            return None

        try:
            mgr = await self._wmc.GlobalSystemMediaTransportControlsSessionManager.request_async()
            sessions = mgr.get_sessions()
            if not sessions:
                return None

            candidates = []
            for session in sessions:
                props = await session.try_get_media_properties_async()
                if not props or not props.title:
                    continue

                player_id = session.source_app_user_model_id or "Windows Media"
                title = props.title.strip()
                artist = props.artist.strip() if props.artist else ""
                album = props.album_title.strip() if props.album_title else ""

                if not _is_valid_music_session(player_id, title, artist):
                    continue

                info = session.get_playback_info()
                if not info:
                    continue

                playback_status = info.playback_status
                # 4 == Playing, 3 == Paused
                is_playing = playback_status == 4 or playback_status == 3

                timeline = session.get_timeline_properties()
                duration = int(timeline.end_time.total_seconds()) if timeline and timeline.end_time else 0
                position = int(timeline.position.total_seconds()) if timeline and timeline.position else 0
                updated = timeline.last_updated_time if timeline else None

                candidates.append({
                    "track": MediaTrackInfo(
                        title=title,
                        artist=artist or "Unknown Artist",
                        album=album,
                        duration_sec=duration,
                        position_sec=position,
                        player_name=player_id,
                        is_playing=is_playing,
                    ),
                    "is_playing": is_playing,
                    "updated": updated
                })

            if not candidates:
                return None

            # Prioritize playing sessions, then recently updated
            candidates.sort(key=lambda x: (x["is_playing"], x["updated"] or 0), reverse=True)
            return candidates[0]["track"]
        except Exception:
            return None


class LinuxMPRISListener(BaseMediaListener):
    """Linux MPRIS2 media listener via playerctl or dbus."""

    def __init__(self):
        self._available = _SYSTEM == "Linux"

    async def get_current_track(self) -> Optional[MediaTrackInfo]:
        if not self._available:
            return None

        try:
            # Check playerctl output
            cmd = ["playerctl", "metadata", "--format", "{{status}}:::{{artist}}:::{{title}}:::{{album}}:::{{mpris:length}}:::{{playerName}}"]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            if proc.returncode != 0 or not stdout:
                return None

            line = stdout.decode("utf-8").strip()
            parts = line.split(":::")
            if len(parts) < 6:
                return None

            status, artist, title, album, length_us, player_name = parts[:6]
            is_playing = status.lower() == "playing"
            duration_sec = 0
            if length_us.isdigit():
                duration_sec = int(int(length_us) / 1_000_000)

            return MediaTrackInfo(
                title=title.strip(),
                artist=artist.strip() if artist else "Unknown Artist",
                album=album.strip(),
                duration_sec=duration_sec,
                player_name=player_name,
                is_playing=is_playing,
            )
        except Exception:
            return None


class ProcessTitleScanner(BaseMediaListener):
    """Universal window title scanner fallback for Windows / Linux / macOS."""

    def __init__(self):
        self._known_players = [
            ("Spotify", r"^Spotify(?: Free)? - (.*)"),
            ("AIMP", r"^(.*) - AIMP$"),
            ("foobar2000", r"^(.*) \[foobar2000\]$"),
            ("VLC", r"^(.*) - VLC media player$"),
            ("VK", r"^(.*) \| ВКонтакте$"),
            ("Yandex", r"^(.*) — Яндекс Музыка$"),
        ]

    async def get_current_track(self) -> Optional[MediaTrackInfo]:
        if _SYSTEM == "Windows":
            return self._scan_windows()
        return None

    def _parse_window_title(self, title: str) -> Optional[MediaTrackInfo]:
        """Parse track and artist metadata from an open window title."""
        if not title or title in ("Spotify Free", "Spotify Premium", "Spotify") or " - " not in title:
            return None

        for player_name, pat in self._known_players:
            match = re.match(pat, title)
            if match:
                raw_meta = match.group(1)
                if " - " in raw_meta:
                    artist, track = raw_meta.split(" - ", 1)
                    return MediaTrackInfo(
                        title=track.strip(),
                        artist=artist.strip(),
                        player_name=player_name,
                        is_playing=True,
                    )
        return None

    def _scan_windows(self) -> Optional[MediaTrackInfo]:
        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            found_track: Optional[MediaTrackInfo] = None

            def enum_windows_proc(hwnd, _lparam):
                nonlocal found_track
                if not user32.IsWindowVisible(hwnd):
                    return True

                length = user32.GetWindowTextLengthW(hwnd)
                if length == 0:
                    return True

                buff = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buff, length + 1)
                parsed = self._parse_window_title(buff.value)
                if parsed:
                    found_track = parsed
                    return False  # Stop enumeration
                return True

            proc_callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
            user32.EnumWindows(proc_callback_type(enum_windows_proc), 0)
            return found_track
        except Exception:
            return None


class CompositeMediaListener:
    """Aggregates all listeners with automatic fallback."""

    def __init__(self):
        self.listeners: list[BaseMediaListener] = []
        if _SYSTEM == "Windows":
            self.listeners.append(WindowsSMTCListener())
            self.listeners.append(ProcessTitleScanner())
        elif _SYSTEM == "Linux":
            self.listeners.append(LinuxMPRISListener())
            self.listeners.append(ProcessTitleScanner())
        else:
            self.listeners.append(ProcessTitleScanner())

    async def get_current_track(self) -> Optional[MediaTrackInfo]:
        for listener in self.listeners:
            try:
                track = await listener.get_current_track()
                if track and track.title and track.artist:
                    return track
            except Exception:
                continue
        return None
