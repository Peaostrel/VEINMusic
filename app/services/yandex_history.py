"""Yandex Music listening history (`/music-history`).

The music.yandex.ru web player does not publish its state to Ynison, but it
does report plays to Yandex, and they show up in the account's listening
history: days, each with groups (album, playlist, wave) of played tracks.

Run as a script to watch one user's history and Ynison side by side (the
token is never printed):

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


async def _print_history(client: httpx.AsyncClient, token: str, show_shape: bool) -> None:  # pragma: no cover
    import json
    import time

    resp = await client.get(f"{API_URL}/music-history", headers=_headers(token),
                            params={"fullModelsCount": 10}, timeout=10)
    print(f"{time.strftime('%H:%M:%S')} history HTTP {resp.status_code}")  # noqa: T201
    result = resp.json().get("result") or {}
    if show_shape:
        # Shape of one group, without personal data beyond ids
        tab = (result.get("historyTabs") or [{}])[0]
        group = (tab.get("items") or [{}])[0]
        track = ((group.get("tracks") or [{}])[0].get("data") or {}).get("itemId")
        print("keys:", sorted(result.keys()), "tab:", sorted(tab.keys()),  # noqa: T201
              "group:", sorted(group.keys()), "track item:", json.dumps(track, ensure_ascii=False))
    for date, tracks in parse_history(result)[:1]:
        for t in tracks[:5]:
            print(f"  {date} {t.track_id}:{t.album_id} {t.artists} — {t.title}")  # noqa: T201


def _device_label(device: dict[str, Any]) -> str:  # pragma: no cover - manual diagnostics
    info = device.get("info") or {}
    return f"{info.get('type')}/{info.get('app_name')}{' offline' if device.get('is_offline') else ''}"


async def _print_ynison(token: str) -> None:  # pragma: no cover - manual diagnostics
    from app.services import yandex_ynison

    state = await yandex_ynison._read_state(token)
    status = (state.get("player_state") or {}).get("status") or {}
    print(f"  ynison: {yandex_ynison.parse_state(state)} paused={status.get('paused')} "  # noqa: T201
          f"event={(status.get('version') or {}).get('timestamp_ms')} "
          f"active={state.get('active_device_id_optional')} "
          f"devices={[_device_label(d) for d in state.get('devices') or []]}")


async def _diagnose(token: str, minutes: float) -> None:  # pragma: no cover - manual diagnostics
    import asyncio
    import time

    deadline = time.time() + minutes * 60
    first = True
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await _print_history(client, token, show_shape=first)
            except Exception as e:
                print(f"  history error: {e}")  # noqa: T201
            try:
                await _print_ynison(token)
            except Exception as e:
                print(f"  ynison error: {e}")  # noqa: T201
            first = False
            if time.time() > deadline:
                return
            await asyncio.sleep(20)


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
    asyncio.run(_diagnose(token, minutes))


if __name__ == "__main__":  # pragma: no cover
    import sys

    _main(sys.argv[1] if len(sys.argv) > 1 else "",
          float(sys.argv[2]) if len(sys.argv) > 2 else 0)
