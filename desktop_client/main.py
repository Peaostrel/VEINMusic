"""VEINMusic Desktop Client & System Media Listener.

Scrobbles native desktop music apps (Spotify, AIMP, foobar2000, VLC, VK, etc.)
via Windows SMTC, Linux MPRIS, and process title inspection.
"""
from __future__ import annotations

import argparse
import asyncio
import signal
import sys
import time
from typing import Optional

from desktop_client.config import load_config, save_config
from desktop_client.discord_rpc import DiscordRPCManager
from desktop_client.media_listener import CompositeMediaListener, MediaTrackInfo
from desktop_client.scrobbler import DesktopScrobbler


DEFAULT_API_URL = "https://music.vein.guru"


class DesktopClientApp:
    def __init__(self, config: dict):
        self.config = config
        self.scrobbler = DesktopScrobbler(
            api_url=config.get("api_url", DEFAULT_API_URL),
            api_key=config.get("api_key", ""),
        )
        self.listener = CompositeMediaListener()
        self.discord = DiscordRPCManager() if config.get("discord_rpc_enabled", True) else None

        self.current_track: Optional[MediaTrackInfo] = None
        self.track_start_time: float = 0.0
        self.listened_seconds: float = 0.0
        self.has_scrobbled_current: bool = False
        self.is_running: bool = False

    def authenticate_interactive(self) -> None:
        """Prompt user for API Key or login."""
        print("=" * 60)
        print(" 🎵 VEINMusic Desktop Media Scrobbler & Discord RPC 🎵")
        print("=" * 60)
        api_key = self.config.get("api_key")
        api_url = self.config.get("api_url", DEFAULT_API_URL)

        if not api_key:
            print(f"API Server: {api_url}")
            print("Скопируйте ваш API Key со страницы настроек VEINMusic:")
            print(f"  {DEFAULT_API_URL}/settings (Вкладка 'Интеграции' или 'Разработчикам')\n")
            try:
                entered_key = input("Введите ваш API Key: ").strip()
                if entered_key:
                    self.config["api_key"] = entered_key
                    self.scrobbler.update_credentials(api_url, entered_key)
                    save_config(self.config)
                    print("✅ Настройки сохранены в ~/.veinmusic/config.json\n")
            except (KeyboardInterrupt, EOFError):
                sys.exit(0)

    def _process_playback_progress(self, delta_time: float) -> None:
        """Accumulate listened seconds and trigger scrobble if threshold met."""
        if not self.current_track:
            return

        self.listened_seconds += delta_time
        threshold_pct = self.config.get("scrobble_threshold_pct", 50)
        duration = self.current_track.duration_sec or 180
        req_time = min(duration * (threshold_pct / 100.0), 240.0)
        min_duration = self.config.get("min_track_duration_sec", 20)

        if not self.has_scrobbled_current and duration >= min_duration and self.listened_seconds >= req_time:
            self.scrobbler.scrobble(
                title=self.current_track.title,
                artist=self.current_track.artist,
                album=self.current_track.album,
                duration=duration,
                source="desktop",
                listened_sec=int(self.listened_seconds),
            )
            self.has_scrobbled_current = True

    def _finalize_previous_track_if_qualified(self) -> None:
        """Check if previous track qualified before track transition."""
        if not self.current_track or self.has_scrobbled_current:
            return

        duration = self.current_track.duration_sec or 180
        req_time = min(duration * 0.5, 240.0)
        if self.listened_seconds >= req_time and duration >= self.config.get("min_track_duration_sec", 20):
            self.scrobbler.scrobble(
                title=self.current_track.title,
                artist=self.current_track.artist,
                album=self.current_track.album,
                duration=duration,
                source="desktop",
                listened_sec=int(self.listened_seconds),
            )

    def _start_new_track(self, new_track: MediaTrackInfo) -> None:
        """Initialize new track state and broadcast to API & Discord RPC."""
        self.current_track = new_track
        self.track_start_time = time.time()
        self.listened_seconds = 0.0
        self.has_scrobbled_current = False

        print(f"[Desktop] 🎧 Playing: {new_track.artist} - {new_track.title} ({new_track.player_name})")

        self.scrobbler.send_now_playing(
            title=new_track.title,
            artist=new_track.artist,
            album=new_track.album,
            duration=new_track.duration_sec,
            source="desktop",
        )

        if self.discord:
            self.discord.update_presence(
                title=new_track.title,
                artist=new_track.artist,
                album=new_track.album,
                username=self.config.get("username", ""),
                duration_sec=new_track.duration_sec,
                is_playing=True,
            )

    def _handle_track_tick(self, new_track: Optional[MediaTrackInfo], delta_time: float) -> None:
        if not new_track or not new_track.is_playing:
            if self.current_track and self.current_track.is_playing:
                self.current_track.is_playing = False
                if self.discord:
                    self.discord.clear()
            return

        is_same_track = (
            self.current_track is not None
            and self.current_track.title.lower() == new_track.title.lower()
            and self.current_track.artist.lower() == new_track.artist.lower()
        )

        if is_same_track:
            self._process_playback_progress(delta_time)
        else:
            self._finalize_previous_track_if_qualified()
            self._start_new_track(new_track)

    async def run(self) -> None:
        """Main listening loop."""
        self.is_running = True
        poll_interval = float(self.config.get("poll_interval_sec", 3.0))
        last_flush_time = time.time()

        print("[Desktop] 🚀 VEINMusic listener started. Monitoring media playback...")
        last_tick = time.time()

        try:
            while self.is_running:
                try:
                    now = time.time()
                    delta = now - last_tick
                    last_tick = now

                    track_info = await self.listener.get_current_track()
                    self._handle_track_tick(track_info, delta)

                    # Periodic offline queue flush (every 60s)
                    if now - last_flush_time > 60.0:
                        self.scrobbler.flush_queue()
                        last_flush_time = now

                    await asyncio.sleep(poll_interval)
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    print(f"[Desktop] Loop error: {e}")
                    await asyncio.sleep(poll_interval)
        finally:
            if self.discord:
                self.discord.close()
            print("[Desktop] Listener stopped.")

    def stop(self) -> None:
        self.is_running = False


def main() -> None:
    parser = argparse.ArgumentParser(description="VEINMusic Desktop Client")
    parser.add_argument("--api-key", help="VEINMusic API Key")
    parser.add_argument("--api-url", default="https://music.vein.guru", help="VEINMusic API URL")
    parser.add_argument("--no-discord", action="store_true", help="Disable Discord Rich Presence")
    args = parser.parse_args()

    config = load_config()
    if args.api_key:
        config["api_key"] = args.api_key
    if args.api_url:
        config["api_url"] = args.api_url
    if args.no_discord:
        config["discord_rpc_enabled"] = False
    save_config(config)

    app = DesktopClientApp(config)
    app.authenticate_interactive()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def signal_handler():
        app.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler in all event loops
            pass

    try:
        loop.run_until_complete(app.run())
    except KeyboardInterrupt:
        app.stop()
    finally:
        loop.close()


if __name__ == "__main__":
    main()
