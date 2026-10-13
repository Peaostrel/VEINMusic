"""Names accepted from third-party listening clients."""
from typing import Any


def normalize_source(value: Any) -> Any:
    if isinstance(value, str):
        name = value.strip().casefold().replace("_", "").replace("-", "").replace(" ", "")
        if name in {"plat", "platmusic"}:
            return "plat"
    return value
