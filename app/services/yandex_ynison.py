"""What is playing in Yandex Music, read through Ynison.

Yandex Music clients (web, desktop, mobile) no longer publish their play queue
to the old REST API (`/queues` returns nothing); they sync the player through
Ynison, a WebSocket service. We join it as a hidden ("shadow") device that
cannot play or control anything, read the current player state once and
disconnect.

Run as a script to check one user's connection (the token is never printed):

    docker compose exec -T worker python - <username> < yandex_ynison.py
"""
from __future__ import annotations

import asyncio
import json
import secrets
import time
from dataclasses import dataclass
from typing import Any

import websockets
from websockets.legacy.client import WebSocketClientProtocol

REDIRECT_URL = "wss://ynison.music.yandex.ru/redirector.YnisonRedirectService/GetRedirectToYnison"
STATE_URL = "wss://{host}/ynison_state.YnisonStateService/PutYnisonState"
TIMEOUT_SEC = 10


class _YnisonProtocol(WebSocketClientProtocol):
    """Ynison takes its credentials in Sec-WebSocket-Protocol as
    `Bearer, v2, {json}` and answers with `Bearer`. The JSON part is not a
    valid subprotocol token, so the header is set by hand and the answer is
    not matched against a list."""

    @staticmethod
    def process_subprotocol(headers, available_subprotocols):  # type: ignore[override]
        return None


# A track "playing" this long past its end is a stale state (the app was
# closed without pausing), not playback
STALE_AFTER_END_MS = 30_000


@dataclass
class Playback:
    track_id: str
    playing: bool
    progress_sec: int
    duration_sec: int


def _connect(url: str, token: str, proto: dict[str, str]):
    return websockets.connect(
        url,
        create_protocol=_YnisonProtocol,
        open_timeout=TIMEOUT_SEC,
        extra_headers={
            "Sec-WebSocket-Protocol": f"Bearer, v2, {json.dumps(proto)}",
            "Origin": "http://music.yandex.ru",
            "Authorization": f"OAuth {token}",
        },
    )


def _hello(device_id: str) -> dict[str, Any]:
    """Minimal state of a hidden device that does not take over playback."""
    version = {"device_id": device_id, "version": 0, "timestamp_ms": 0}
    return {
        "update_full_state": {
            "player_state": {
                "player_queue": {
                    "current_playable_index": -1,
                    "entity_id": "",
                    "entity_type": "VARIOUS",
                    "playable_list": [],
                    "options": {"repeat_mode": "NONE"},
                    "entity_context": "BASED_ON_ENTITY_BY_DEFAULT",
                    "version": version,
                    "from_optional": "",
                },
                "status": {
                    "duration_ms": 0,
                    "paused": True,
                    "playback_speed": 1,
                    "progress_ms": 0,
                    "version": version,
                },
            },
            "device": {
                "capabilities": {
                    "can_be_player": False,
                    "can_be_remote_controller": False,
                    "volume_granularity": 0,
                },
                "info": {"device_id": device_id, "type": "WEB", "title": "VEIN", "app_name": "Chrome"},
                "volume_info": {"volume": 0},
                "is_shadow": True,
            },
            "is_currently_active": False,
        },
        "rid": secrets.token_hex(16),
        "player_action_timestamp_ms": 0,
        "activity_interception_type": "DO_NOT_INTERCEPT_BY_DEFAULT",
    }


def _position(status: dict[str, Any], now_ms: int) -> tuple[int, bool]:
    """(progress_ms, playing). Ynison sends the position at the last player
    event (start, pause, seek) with that event's timestamp; while playing,
    the current position is extrapolated from it."""
    try:
        progress = int(status.get("progress_ms", 0))
        duration = int(status.get("duration_ms", 0))
        stamp = int((status.get("version") or {}).get("timestamp_ms", 0))
        speed = float(status.get("playback_speed", 1) or 1)
    except (TypeError, ValueError):
        return 0, False
    if status.get("paused", True):
        return max(progress, 0), False
    if stamp > 0 and now_ms > stamp:
        progress += int((now_ms - stamp) * speed)
    if duration > 0 and progress > duration + STALE_AFTER_END_MS:
        return duration, False
    if duration > 0:
        progress = min(progress, duration)
    return max(progress, 0), True


def parse_state(state: dict[str, Any], now_ms: int | None = None) -> Playback | None:
    """Current track of a Ynison state message, or None when nothing is queued."""
    player = state.get("player_state")
    if not isinstance(player, dict):
        return None
    queue = player.get("player_queue") or {}
    status = player.get("status") or {}
    items = queue.get("playable_list") or []
    index = queue.get("current_playable_index", -1)
    if not isinstance(index, int) or not 0 <= index < len(items):
        return None
    item = items[index]
    if not isinstance(item, dict) or not item.get("playable_id"):
        return None
    if item.get("playable_type", "TRACK") != "TRACK":
        return None  # videos, local files: nothing to look up
    if now_ms is None:
        now_ms = int(time.time() * 1000)
    progress_ms, playing = _position(status, now_ms)
    try:
        duration = max(int(status.get("duration_ms", 0)) // 1000, 0)
    except (TypeError, ValueError):
        duration = 0
    return Playback(
        track_id=str(item["playable_id"]),
        playing=playing,
        progress_sec=progress_ms // 1000,
        duration_sec=duration,
    )


async def _read_state(token: str) -> dict[str, Any]:
    device_id = secrets.token_hex(8)
    proto = {
        "Ynison-Device-Id": device_id,
        "Ynison-Device-Info": json.dumps({"app_name": "Chrome", "type": 1}),
    }
    async with _connect(REDIRECT_URL, token, proto) as ws:
        redirect = json.loads(await ws.recv())
    host, ticket = redirect.get("host"), redirect.get("redirect_ticket")
    if not host or not ticket:
        raise RuntimeError(f"unexpected Ynison redirect: {str(redirect)[:200]}")
    proto["Ynison-Redirect-Ticket"] = ticket
    async with _connect(STATE_URL.format(host=host), token, proto) as ws:
        await ws.send(json.dumps(_hello(device_id)))
        return json.loads(await ws.recv())


async def fetch_playback(token: str) -> Playback | None:
    """Current Yandex Music track of the token's owner (None if nothing plays).
    Raises on network or protocol errors; the caller decides how to log them."""
    state = await asyncio.wait_for(_read_state(token), timeout=TIMEOUT_SEC * 2)
    return parse_state(state)


def _main(username: str) -> None:  # pragma: no cover - manual diagnostics
    from app.database import SessionLocal
    from app.models import User

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        token = user.integration.yandex_token if user and user.integration else None
    finally:
        db.close()
    if not token:
        print(f"{username}: Yandex token is not set")  # noqa: T201
        return
    state = asyncio.run(_read_state(token))
    status = (state.get("player_state") or {}).get("status")
    print(f"status: {json.dumps(status, ensure_ascii=False)}")  # noqa: T201
    print(f"{username}: {parse_state(state) or 'nothing is playing'}")  # noqa: T201


if __name__ == "__main__":  # pragma: no cover
    import sys

    _main(sys.argv[1] if len(sys.argv) > 1 else "")
