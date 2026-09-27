"""Live Yandex Music scrobbling: one open Ynison connection per linked user.

Polling every 30 seconds made a track switch show up with up to half a minute
of delay. Ynison pushes every player change (track switch, pause, seek) over
the open connection, so the listener reports it at once. Listening time is
credited only when the next event confirms it: the player sends one on every
pause, seek and switch, so the time between two events was played. A tab
closed or an app unloaded mid-track sends nothing, and that stretch is not
counted. While a track plays, a report every TICK_SEC keeps the "now
playing" mark alive without adding time.

The music.yandex.ru web player also writes to Ynison, but always with
paused=True; whether it plays is inferred from the order of its events
(start, pause, resume, seek, track switch).

Runs in the arq worker. A Redis lease makes sure only one process holds the
connections; users whose connection is up are skipped by the 30-second poll
(see `connected`), which stays as the fallback.
"""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.database import SessionLocal
from app.services import runtime_settings, yandex_ynison
from app.services.yandex_ynison import Playback

logger = logging.getLogger(__name__)

TICK_SEC = 15
RECONCILE_SEC = 15
LEASE_KEY = "yandex_live_leader"
# Per-user connection state for the admin panel, and users to reconnect
STATUS_KEY = "yandex_live:status"
HEARTBEAT_KEY = "yandex_live:heartbeat"
RESTART_KEY = "yandex_live:restart"
STATUS_TTL_SEC = 60
LEASE_TTL_SEC = 45
RETRY_MIN_SEC = 5
RETRY_MAX_SEC = 120
SPAM_RETRY_SEC = 1.2
# Web player events (see Playback.pause_unknown): an event this close to
# where playback should be is a pause; one at the paused position a resume
PAUSE_SLACK_SEC = 3
RESUME_SLACK_SEC = 1
# A switch this late after the track's natural end still ends it normally
CONFIRM_SLACK_SEC = 30
# Without a known length, a stretch longer than this is not trusted
UNKNOWN_LENGTH_MAX_SEC = 900

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
        self._last_event: tuple = ()
        # The stretch of playback not yet credited: (track, since ms, from position, duration)
        self._segment: tuple[str, int, int, int] | None = None
        self._tasks: list[asyncio.Task] = []
        self.connected_since_ms: int | None = None
        self.last_error: str | None = None
        self.last_error_ms: int | None = None
        self.reconnects = 0

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
                await yandex_ynison.listen(self.token, self.on_playback, on_open=self._opened)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"Ynison live connection for user {self.user_id} failed: {e}")
                self.last_error, self.last_error_ms = str(e)[:300], _now_ms()
            finally:
                connected.discard(self.user_id)
                self.connected_since_ms = None
            # A connection that stayed up for a while resets the backoff
            if _now_ms() - opened_ms > 60_000:
                delay = RETRY_MIN_SEC
            await asyncio.sleep(delay)
            delay = min(delay * 2, RETRY_MAX_SEC)

    def _opened(self) -> None:
        connected.add(self.user_id)
        if self.connected_since_ms is None:
            self.reconnects += 1
        self.connected_since_ms = _now_ms()

    def status(self) -> dict[str, Any]:
        """Connection state shown in the admin panel."""
        pb = self.playback
        position = self.current_position()
        return {
            "connected": self.user_id in connected,
            "since_ms": self.connected_since_ms,
            "last_event_ms": self.received_ms or None,
            "track_id": pb.track_id if pb else None,
            "playing": bool(position and position[1]),
            "web": bool(pb and pb.pause_unknown),
            "last_error": self.last_error,
            "last_error_ms": self.last_error_ms,
            "connections": self.reconnects,
        }

    async def on_playback(self, playback: Playback | None) -> None:
        if playback is not None and playback.event and playback.event == self._last_event:
            return  # the same player event pushed again
        expected = self.current_position()
        playback = self._interpret(playback, expected)
        now = _now_ms()
        segment, credit = self._segment, self._confirmed_sec(now) or 0
        restarted = self._restarted(playback, expected)
        self.playback = playback
        self.received_ms = now
        self._segment = (playback.track_id, now, playback.progress_sec, playback.duration_sec) \
            if playback is not None and playback.playing else None

        closing = segment is not None and (playback is None or playback.track_id != segment[0] or restarted)
        if closing and segment is not None:
            # The track playing until now was switched or stopped: it gets
            # the listening this event confirms
            await self._report(segment[0], segment[2] + credit, False, credit)
            credit = 0
        if playback is None:
            return
        # Pure device updates (volume, another device joining) repeat the
        # same track and state: the tick loop covers those
        if (playback.track_id, playback.playing) != self._last_reported or restarted or credit:
            await self._report(playback.track_id, playback.progress_sec, playback.playing, credit)

    def _interpret(self, playback: Playback | None, expected: tuple[int, bool] | None) -> Playback | None:
        """Remember the event; for the web player, work out play/pause."""
        if playback is None:
            return None
        self._last_event = playback.event
        if not playback.pause_unknown:
            return playback
        return playback.with_playing(self._web_playing(playback, expected))

    def _restarted(self, playback: Playback | None, expected: tuple[int, bool] | None) -> bool:
        """The same track started over (repeat, seek back to the start)."""
        return bool(expected is not None and playback is not None and playback.playing
                    and self.playback is not None and playback.track_id == self.playback.track_id
                    and playback.progress_sec + 5 < expected[0])

    def _confirmed_sec(self, now_ms: int) -> int | None:
        """Seconds of the current stretch of playback that a new player event
        confirms. Every pause, seek or switch sends one, so the player played
        without a break until now, as long as the track could still be
        playing. An event long after the track should have ended means the
        player went away unseen (a closed tab, an unloaded app): nothing is
        confirmed then."""
        if self._segment is None:
            return None
        _, start_ms, start_pos, duration = self._segment
        elapsed = max(now_ms - start_ms, 0) // 1000
        if not duration:
            return elapsed if elapsed <= UNKNOWN_LENGTH_MAX_SEC else None
        remaining = max(duration - start_pos, 0)
        if elapsed > remaining + CONFIRM_SLACK_SEC:
            return None
        return min(elapsed, remaining)

    def _pending_sec(self, now_ms: int) -> int:
        """Seconds played since the last player event, not confirmed yet:
        shown while the track plays, counted only by the next event."""
        if self._segment is None:
            return 0
        _, start_ms, start_pos, duration = self._segment
        elapsed = max(now_ms - start_ms, 0) // 1000
        return min(elapsed, max(duration - start_pos, 0)) if duration else min(elapsed, UNKNOWN_LENGTH_MAX_SEC)

    def _web_playing(self, pb: Playback, expected: tuple[int, bool] | None) -> bool:
        """Whether the web player plays, judged by what its event means:
        it sends one on start, pause, resume, seek and track switch."""
        prev = self.playback
        if prev is None or prev.track_id != pb.track_id or expected is None:
            # A switch arrives live; the first state after connecting may be old
            return prev is not None or self._fresh(pb)
        progress, playing = expected
        if playing:
            return abs(pb.progress_sec - progress) > PAUSE_SLACK_SEC  # else paused; a jump is a seek
        return abs(pb.progress_sec - progress) <= RESUME_SLACK_SEC  # else a seek while paused

    @staticmethod
    def _fresh(pb: Playback) -> bool:
        """The event is recent enough that the track could still be playing."""
        if not pb.event_ms:
            return False
        left_ms = max(pb.duration_sec - pb.progress_sec, 0) * 1000 if pb.duration_sec else 0
        return _now_ms() - pb.event_ms <= left_ms + yandex_ynison.STALE_AFTER_END_MS

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
        """Keeps the "now playing" mark alive; listening time is added only
        by player events (see _confirmed_sec)."""
        while True:
            await asyncio.sleep(TICK_SEC)
            pb, position = self.playback, self.current_position()
            if pb is None or position is None:
                continue
            progress, playing = position
            if not playing:
                self._segment = None  # played past the end without a word: the player is gone
            if playing or self._last_reported == (pb.track_id, True):
                await self._report(pb.track_id, progress, playing, 0, self._pending_sec(_now_ms()))

    # --- reporting -------------------------------------------------------

    async def _report(self, track_id: str, progress: int, playing: bool, credit: int = 0,
                      pending: int = 0) -> None:
        """Report the player state; `credit` is confirmed listening to add,
        `pending` the stretch played since the last event (only shown)."""
        from app.core.redis import redis_lock
        from app.services import cloud_scrobbling as cs
        try:
            async with redis_lock(f"scrobble_lock:{self.user_id}", expire_sec=30):
                status = await self._report_once(cs, track_id, progress, playing, credit, pending)
                if status == "ignored_spam_protection":
                    # The previous report for this user was under a second
                    # ago; a track switch must not be lost to that guard
                    await asyncio.sleep(SPAM_RETRY_SEC)
                    await self._report_once(cs, track_id, progress + 1, playing, credit, pending)
            self._last_reported = (track_id, playing)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Ynison live report for user {self.user_id} failed: {e}")

    async def _report_once(self, cs, track_id: str, progress: int, playing: bool, credit: int = 0,
                           pending: int = 0):
        from app.models import User
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == self.user_id).first()
            if user is None or not user.integration or not user.integration.yandex_token:
                return None
            async with httpx.AsyncClient() as client:
                return await cs._fetch_yandex_track_info(
                    client, track_id, cs._yandex_headers(self.token), self.process_func, db, user,
                    position=(progress, playing), credit_sec=credit, pending_sec=pending)
        finally:
            db.close()


def load_linked_users() -> dict[int, str]:
    """{user_id: Yandex token} of non-banned users with a linked account."""
    from app.models import User, UserIntegration
    db = SessionLocal()
    try:
        if not runtime_settings.is_feature_enabled("integration_yandex", db):
            return {}
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

    async def _restart_requested(self) -> None:
        """Drop listeners the admin panel asked to reconnect; the next
        reconcile starts them again with a fresh connection."""
        from app.core.redis import get_redis_client
        try:
            client = get_redis_client()
            ids = await client.smembers(RESTART_KEY)
            if ids:
                await client.delete(RESTART_KEY)
        except Exception:
            return
        for raw in ids or ():
            listener = self.listeners.pop(int(raw), None)
            if listener is not None:
                await listener.stop()

    async def publish_status(self) -> None:
        from app.core.redis import get_redis_client
        try:
            client = get_redis_client()
            pipe = client.pipeline()
            pipe.delete(STATUS_KEY)
            if self.listeners:
                pipe.hset(STATUS_KEY, mapping={str(uid): json.dumps(listener.status())
                                               for uid, listener in self.listeners.items()})
                pipe.expire(STATUS_KEY, STATUS_TTL_SEC)
            pipe.set(HEARTBEAT_KEY, str(_now_ms()), ex=STATUS_TTL_SEC)
            await pipe.execute()
        except Exception as e:
            logger.debug(f"Yandex live status not published: {e}")

    async def run(self) -> None:
        try:
            while True:
                try:
                    if await self._hold_lease():
                        await self._restart_requested()
                        await self.reconcile(await asyncio.to_thread(load_linked_users))
                        await self.publish_status()
                    else:
                        await self.stop_all()
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("Yandex live manager error")
                await asyncio.sleep(RECONCILE_SEC)
        finally:
            await self.stop_all()
