"""Configuration manager for VEINMusic Desktop Client."""
from __future__ import annotations

import json
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

    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            config = dict(DEFAULT_CONFIG)
            config.update(data)
            return config
    except Exception as e:
        print(f"[Config] Error loading config: {e}. Using defaults.")
        return dict(DEFAULT_CONFIG)


def save_config(config: dict[str, Any]) -> None:
    """Save config to disk."""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Config] Error saving config: {e}")
