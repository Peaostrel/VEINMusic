"""Validated, forwards-compatible user preferences stored as one JSON blob."""

from __future__ import annotations

import json
from typing import Any

from app.schemas import UserPreferences


def get_preferences(profile: Any) -> UserPreferences:
    raw = getattr(profile, "preferences", None)
    if not raw:
        return UserPreferences()
    try:
        data = json.loads(str(raw))
        if not isinstance(data, dict):
            return UserPreferences()
        # Merge each known section with current defaults so accounts saved by
        # an older release automatically receive newly introduced options.
        defaults = UserPreferences().model_dump(mode="json")
        merged = dict(defaults)
        for key, default_value in defaults.items():
            incoming = data.get(key)
            if isinstance(default_value, dict) and isinstance(incoming, dict):
                merged[key] = {**default_value, **incoming}
            elif incoming is not None:
                merged[key] = incoming
        return UserPreferences.model_validate(merged)
    except (TypeError, ValueError):
        return UserPreferences()


def save_preferences(profile: Any, preferences: UserPreferences) -> None:
    profile.preferences = preferences.model_dump_json()


def preferences_dict(profile: Any) -> dict[str, Any]:
    return get_preferences(profile).model_dump(mode="json")


def public_preferences(profile: Any) -> dict[str, Any]:
    """Preferences needed to render a public profile, without private lists."""
    data = preferences_dict(profile)
    return {
        "appearance": data["appearance"],
        "profile": data["profile"],
        "privacy": data["privacy"],
        "wrapped": data["wrapped"],
        "experiments": {
            "smart_recommendations": data["experiments"]["smart_recommendations"],
            "taste_passport": data["experiments"]["taste_passport"],
            "new_profile_layout": data["experiments"]["new_profile_layout"],
        },
    }


def preference_enabled(profile: Any, section: str, key: str, default: bool = True) -> bool:
    data = preferences_dict(profile)
    value = data.get(section, {}).get(key, default)
    return value if isinstance(value, bool) else default
