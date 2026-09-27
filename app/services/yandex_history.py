"""Yandex Music listening history (`/music-history`).

The music.yandex.ru web player does not publish its state to Ynison, but it
does report plays to Yandex, and they show up in the account's listening
history: days, each with groups (album, playlist, wave) of played tracks.

Run as a script to watch one user's Ynison updates live next to the history
(the token is never printed):

    docker compose exec -T worker python - <username> [minutes] < yandex_history.py
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

API_URL = "https://api.music.yandex.net"


@dataclass(frozen=True)
class HistoryTrack:
    track_id: str
    album_id: str
    title: str
    artists: str


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"OAuth {token}",
        "X-Yandex-Music-Client": "YandexMusicAndroid/2023.12.1",
        "User-Agent": "Yandex-Music-API",
    }


def _parse_track(item: dict[str, Any]) -> HistoryTrack | None:
    data = item.get("data") or {}
    ids = data.get("itemId") or {}
    if item.get("type") != "track" or not ids.get("trackId"):
        return None
    model = data.get("fullModel") or {}
    return HistoryTrack(
        track_id=str(ids["trackId"]),
        album_id=str(ids.get("albumId") or ""),
        title=str(model.get("title") or ""),
        artists=", ".join(a.get("name", "") for a in model.get("artists") or []),
    )


def _parse_day(tab: dict[str, Any]) -> list[HistoryTrack]:
    items = [item for group in tab.get("items") or [] for item in group.get("tracks") or []]
    return [t for t in map(_parse_track, items) if t is not None]


def parse_history(result: dict[str, Any]) -> list[tuple[str, list[HistoryTrack]]]:
    """[(date, tracks)] in the order the API returns them."""
    return [(str(tab.get("date") or ""), _parse_day(tab)) for tab in result.get("historyTabs") or []]


async def fetch_history(client: httpx.AsyncClient, token: str,
                        full_models: int = 10) -> list[tuple[str, list[HistoryTrack]]]:
    resp = await client.get(f"{API_URL}/music-history", headers=_headers(token),
                            params={"fullModelsCount": full_models}, timeout=10)
    resp.raise_for_status()
    return parse_history(resp.json().get("result") or {})


def _version(obj: dict[str, Any]) -> str:  # pragma: no cover - manual diagnostics
    import time

    v = obj.get("version") or {}
    ts = int(v.get("timestamp_ms") or 0)
    return f"{str(v.get('device_id') or '-')[:8]}@{time.strftime('%H:%M:%S', time.gmtime(ts / 1000)) if ts else '-'}"


def _describe_state(state: dict[str, Any]) -> str:  # pragma: no cover - manual diagnostics
    player = state.get("player_state") or {}
    queue = player.get("player_queue") or {}
    status = player.get("status") or {}
    items = queue.get("playable_list") or []
    index = queue.get("current_playable_index", -1)
    track = items[index].get("playable_id") if isinstance(index, int) and 0 <= index < len(items) else None
    devices = [f"{str((d.get('info') or {}).get('device_id'))[:8]}:{(d.get('info') or {}).get('type')}"
               f"{'/off' if d.get('is_offline') else ''}" for d in state.get("devices") or []]
    return (f"track={track} idx={index}/{len(items)} queue={_version(queue)} | "
            f"paused={status.get('paused')} pos={int(status.get('progress_ms') or 0) // 1000}s "
            f"dur={int(status.get('duration_ms') or 0) // 1000}s status={_version(status)} | "
            f"active={str(state.get('active_device_id_optional') or '-')[:8]} devices={devices}")


async def _print_history(client: httpx.AsyncClient, token: str) -> None:  # pragma: no cover
    import time

    days = await fetch_history(client, token, full_models=3)
    head = [f"{t.artists} — {t.title}" for _, tracks in days[:1] for t in tracks[:3]]
    print(f"{time.strftime('%H:%M:%S')} history: {head}")  # noqa: T201


async def _watch(token: str, minutes: float) -> None:  # pragma: no cover - manual diagnostics
    """Keep one Ynison connection open and print every state it pushes;
    print the head of the history every 30 seconds."""
    import asyncio
    import json
    import secrets
    import time

    from app.services import yandex_ynison as yy

    device_id = secrets.token_hex(8)
    proto = {"Ynison-Device-Id": device_id,
             "Ynison-Device-Info": json.dumps({"app_name": "Chrome", "type": 1})}
    async with yy._connect(yy.REDIRECT_URL, token, proto) as ws:
        redirect = json.loads(await ws.recv())
    if "redirect_ticket" not in redirect:
        raise RuntimeError(f"unexpected Ynison redirect: {str(redirect)[:200]}")
    proto["Ynison-Redirect-Ticket"] = redirect["redirect_ticket"]
    deadline = time.time() + minutes * 60
    async with httpx.AsyncClient() as client, \
            yy._connect(yy.STATE_URL.format(host=redirect["host"]), token, proto) as ws:
        await ws.send(json.dumps(yy._hello(device_id)))
        next_history = 0.0
        while time.time() < deadline:
            if time.time() >= next_history:
                await _print_history(client, token)
                next_history = time.time() + 30
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=5)
            except asyncio.TimeoutError:
                continue
            print(f"{time.strftime('%H:%M:%S')} ynison: {_describe_state(json.loads(raw))}")  # noqa: T201


def _main(username: str, minutes: float) -> None:  # pragma: no cover - manual diagnostics
    import asyncio

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
    asyncio.run(_watch(token, minutes or 3))


if __name__ == "__main__":  # pragma: no cover
    import sys

    _main(sys.argv[1] if len(sys.argv) > 1 else "",
          float(sys.argv[2]) if len(sys.argv) > 2 else 0)
