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


def parse_history(result: dict[str, Any]) -> list[tuple[str, list[HistoryTrack]]]:
    """[(date, tracks)] in the order the API returns them."""
    days = []
    for tab in result.get("historyTabs") or []:
        tracks = []
        for group in tab.get("items") or []:
            for item in group.get("tracks") or []:
                data = item.get("data") or {}
                ids = data.get("itemId") or {}
                model = data.get("fullModel") or {}
                if item.get("type") != "track" or not ids.get("trackId"):
                    continue
                tracks.append(HistoryTrack(
                    track_id=str(ids["trackId"]),
                    album_id=str(ids.get("albumId") or ""),
                    title=str(model.get("title") or ""),
                    artists=", ".join(a.get("name", "") for a in model.get("artists") or []),
                ))
        days.append((str(tab.get("date") or ""), tracks))
    return days


async def fetch_history(client: httpx.AsyncClient, token: str,
                        full_models: int = 10) -> list[tuple[str, list[HistoryTrack]]]:
    resp = await client.get(f"{API_URL}/music-history", headers=_headers(token),
                            params={"fullModelsCount": full_models}, timeout=10)
    resp.raise_for_status()
    return parse_history(resp.json().get("result") or {})


async def _diagnose(token: str, minutes: float) -> None:  # pragma: no cover - manual diagnostics
    import asyncio
    import json
    import time

    from app.services import yandex_ynison

    first = True
    deadline = time.time() + minutes * 60
    async with httpx.AsyncClient() as client:
        while True:
            stamp = time.strftime("%H:%M:%S")
            try:
                resp = await client.get(f"{API_URL}/music-history", headers=_headers(token),
                                        params={"fullModelsCount": 10}, timeout=10)
                print(f"{stamp} history HTTP {resp.status_code}")  # noqa: T201
                body = resp.json()
                if first:
                    # Shape of one group, without personal data beyond ids
                    tab = ((body.get("result") or {}).get("historyTabs") or [{}])[0]
                    group = (tab.get("items") or [{}])[0]
                    print("keys:", sorted((body.get("result") or {}).keys()),  # noqa: T201
                          "tab:", sorted(tab.keys()), "group:", sorted(group.keys()),
                          "track item:", json.dumps(((group.get("tracks") or [{}])[0].get("data") or {})
                                                    .get("itemId"), ensure_ascii=False))
                for date, tracks in parse_history(body.get("result") or {})[:1]:
                    for t in tracks[:5]:
                        print(f"  {date} {t.track_id}:{t.album_id} {t.artists} — {t.title}")  # noqa: T201
            except Exception as e:
                print(f"{stamp} history error: {e}")  # noqa: T201
            try:
                state = await yandex_ynison._read_state(token)
                player = state.get("player_state") or {}
                status = player.get("status") or {}
                version = status.get("version") or {}
                devices = [f"{(d.get('info') or {}).get('type')}/{(d.get('info') or {}).get('app_name')}"
                           f"{'' if not d.get('is_offline') else ' offline'}"
                           for d in state.get("devices") or []]
                print(f"  ynison: {yandex_ynison.parse_state(state)} paused={status.get('paused')} "  # noqa: T201
                      f"event={version.get('timestamp_ms')} active={state.get('active_device_id_optional')} "
                      f"devices={devices}")
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
