"""Live Yandex Music scrobbling: one open Ynison connection per linked user.

Polling every 30 seconds made a track switch show up with up to half a minute
of delay. Ynison pushes every player change (track switch, pause, seek) over
the open connection, so the listener reports it at once. While a track plays,
it also reports every TICK_SEC so the listened time keeps accumulating
(process_scrobble only counts gaps shorter than 35 seconds).

Runs in the arq worker. A Redis lease makes sure only one process holds the
connections; users whose connection is up are skipped by the 30-second poll
(see `connected`), which stays as the fallback.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.database import SessionLocal
from app.services import yandex_ynison
from app.services.yandex_ynison import Playback

logger = logging.getLogger(__name__)

TICK_SEC = 15
RECONCILE_SEC = 15
LEASE_KEY = "yandex_live_leader"
LEASE_TTL_SEC = 45
RETRY_MIN_SEC = 5
RETRY_MAX_SEC = 120
SPAM_RETRY_SEC = 1.2

# Users whose Ynison connection is open in this process
connected: set[int] = set()

ProcessFunc = Callable[..., Awaitable[Any]]


def _now_ms() -> int:
    return int(time.time() * 1000)


class UserListener:
    """Keeps one user's Ynison connection open and reports playback."""

    def __init__(self, user_id: int, token: str, process_func: ProcessFunc):
        self.user_id = user_id
        self.token = token
        self.process_func = process_func
        self.playback: Playback | None = None
        self.received_ms = 0
        self._last_reported: tuple[str, bool] | None = None
        self._tasks: list[asyncio.Task] = []

    def start(self) -> None:
        self._tasks = [asyncio.create_task(self._connection_loop()),
                       asyncio.create_task(self._tick_loop())]

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        connected.discard(self.user_id)

    # --- connection -----------------------------------------------------

    async def _connection_loop(self) -> None:
        delay = RETRY_MIN_SEC
        while True:
            opened_ms = _now_ms()
            try:
                await yandex_ynison.listen(self.token, self.on_playback,
                                           on_open=lambda: connected.add(self.user_id))
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"Ynison live connection for user {self.user_id} failed: {e}")
            finally:
                connected.discard(self.user_id)
            # A connection that stayed up for a while resets the backoff
            if _now_ms() - opened_ms > 60_000:
                delay = RETRY_MIN_SEC
            await asyncio.sleep(delay)
            delay = min(delay * 2, RETRY_MAX_SEC)

    async def on_playback(self, playback: Playback | None) -> None:
        expected = self.current_position()
        self.playback = playback
        self.received_ms = _now_ms()
        if playback is None:
            return
        key = (playback.track_id, playback.playing)
        # The same track started over (repeat, seek back to the start)
        restarted = (expected is not None and playback.playing
                     and playback.progress_sec + 5 < expected[0])
        # Pure device updates (volume, another device joining) repeat the
        # same track and state: the tick loop covers those
        if key != self._last_reported or restarted:
            await self._report(playback.track_id, playback.progress_sec, playback.playing)

    # --- periodic progress ---------------------------------------------

    def current_position(self, now_ms: int | None = None) -> tuple[int, bool] | None:
        """(progress_sec, playing) now, extrapolated from the last state."""
        pb = self.playback
        if pb is None:
            return None
        if not pb.playing:
            return pb.progress_sec, False
        elapsed = max(((now_ms or _now_ms()) - self.received_ms) // 1000, 0)
        progress = pb.progress_sec + elapsed
        if pb.duration_sec and progress > pb.duration_sec + yandex_ynison.STALE_AFTER_END_MS // 1000:
            return pb.duration_sec, False  # no track switch arrived: stopped
        if pb.duration_sec:
            progress = min(progress, pb.duration_sec)
        return progress, True

    async def _tick_loop(self) -> None:
        while True:
            await asyncio.sleep(TICK_SEC)
            pb, position = self.playback, self.current_position()
            if pb is None or position is None:
                continue
            progress, playing = position
            if playing or self._last_reported == (pb.track_id, True):
                await self._report(pb.track_id, progress, playing)

    # --- reporting -------------------------------------------------------

    async def _report(self, track_id: str, progress: int, playing: bool) -> None:
        from app.core.redis import redis_lock
        from app.services import cloud_scrobbling as cs
        try:
            async with redis_lock(f"scrobble_lock:{self.user_id}", expire_sec=30):
                status = await self._report_once(cs, track_id, progress, playing)
                if status == "ignored_spam_protection":
                    # The previous report for this user was under a second
                    # ago; a track switch must not be lost to that guard
                    await asyncio.sleep(SPAM_RETRY_SEC)
                    await self._report_once(cs, track_id, progress + 1, playing)
            self._last_reported = (track_id, playing)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Ynison live report for user {self.user_id} failed: {e}")

    async def _report_once(self, cs, track_id: str, progress: int, playing: bool):
        from app.models import User
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == self.user_id).first()
            if user is None or not user.integration or not user.integration.yandex_token:
                return None
            async with httpx.AsyncClient() as client:
                return await cs._fetch_yandex_track_info(
                    client, track_id, cs._yandex_headers(self.token), self.process_func, db, user,
                    position=(progress, playing))
        finally:
            db.close()


def load_linked_users() -> dict[int, str]:
    """{user_id: Yandex token} of non-banned users with a linked account."""
    from app.models import User, UserIntegration
    db = SessionLocal()
    try:
        rows = db.query(User.id, UserIntegration).join(UserIntegration).filter(
            User.is_banned.isnot(True), UserIntegration.yandex_token.isnot(None)).all()
        return {int(uid): integ.yandex_token for uid, integ in rows if integ.yandex_token}
    finally:
        db.close()


class LiveManager:
    def __init__(self, process_func: ProcessFunc):
        self.process_func = process_func
        self.listeners: dict[int, UserListener] = {}
        self._lease_id = secrets.token_hex(8)

    async def _hold_lease(self) -> bool:
        """Only one process keeps the connections; the lease expires on its
        own if that process dies."""
        from app.core.redis import get_redis_client
        try:
            client = get_redis_client()
            if await client.get(LEASE_KEY) in (self._lease_id, self._lease_id.encode()):
                await client.expire(LEASE_KEY, LEASE_TTL_SEC)
                return True
            return bool(await client.set(LEASE_KEY, self._lease_id, nx=True, ex=LEASE_TTL_SEC))
        except Exception:
            return True  # no Redis: single process

    async def reconcile(self, wanted: dict[int, str]) -> None:
        stale = [uid for uid, listener in self.listeners.items()
                 if wanted.get(uid) != listener.token]
        for uid in stale:
            await self.listeners.pop(uid).stop()
        for uid, token in wanted.items():
            if uid not in self.listeners:
                listener = UserListener(uid, token, self.process_func)
                listener.start()
                self.listeners[uid] = listener

    async def stop_all(self) -> None:
        await self.reconcile({})

    async def run(self) -> None:
        try:
            while True:
                try:
                    if await self._hold_lease():
                        await self.reconcile(await asyncio.to_thread(load_linked_users))
                    else:
                        await self.stop_all()
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("Yandex live manager error")
                await asyncio.sleep(RECONCILE_SEC)
        finally:
            await self.stop_all()
