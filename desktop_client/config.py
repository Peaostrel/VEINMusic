"""Configuration manager for VEINMusic Desktop Client."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

CONFIG_DIR = Path.home() / ".veinmusic"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_CONFIG: dict[str, Any] = {
    "api_url": "https://music.vein.guru",
    "api_key": "",
    "username": "",
    "discord_rpc_enabled": True,
    "scrobble_threshold_pct": 50,
    "poll_interval_sec": 3.0,
    "listen_native_smtc": True,
    "listen_mpris": True,
    "listen_process_scanner": True,
    "min_track_duration_sec": 20,
}


def load_config() -> dict[str, Any]:
    """Load config from disk or return default config."""
    if not CONFIG_FILE.exists():
        save_config(DEFAULT_CONFIG)
        return dict(DEFAULT_CONFIG)

    _restrict_permissions()  # tighten configs written by older versions
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            config = dict(DEFAULT_CONFIG)
            config.update(data)
            return config
    except Exception as e:
        print(f"[Config] Error loading config: {e}. Using defaults.")
        return dict(DEFAULT_CONFIG)


def _restrict_permissions() -> None:
    """The config holds the API key: keep it readable by the owner only.
    (No-op on Windows, where the home directory is already private.)"""
    if os.name != "posix":
        return
    try:
        os.chmod(CONFIG_DIR, 0o700)
        if CONFIG_FILE.exists():
            os.chmod(CONFIG_FILE, 0o600)
    except OSError as e:
        print(f"[Config] Could not restrict permissions: {e}")


def save_config(config: dict[str, Any]) -> None:
    """Save config to disk (owner-only permissions on POSIX)."""
    try:
        CONFIG_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
        # Create the file as 0600 from the start so the key is never world-readable
        fd = os.open(CONFIG_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        _restrict_permissions()
    except Exception as e:
        print(f"[Config] Error saving config: {e}")
