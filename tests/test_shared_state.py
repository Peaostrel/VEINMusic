"""Cross-process WebSocket state via Redis.

Uses a real Redis when TEST_REDIS_URL is set (CI provides one); otherwise the
tests are skipped. Two ConnectionManager instances stand in for two API
processes sharing the same Redis.
"""
import asyncio
import os
from unittest.mock import AsyncMock

import pytest

from app.core.websockets import ConnectionManager

REDIS_URL = os.getenv("TEST_REDIS_URL")
pytestmark = pytest.mark.skipif(not REDIS_URL, reason="TEST_REDIS_URL not set")


def _fake_ws():
    ws = AsyncMock()
    ws.send_json = AsyncMock()
    return ws


async def _wait_for(predicate, timeout=2.0):
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if predicate():
            return True
        await asyncio.sleep(0.02)
    return predicate()


def test_user_broadcast_reaches_socket_in_other_process(monkeypatch):
    monkeypatch.setenv("REDIS_URL", REDIS_URL)

    async def scenario():
        api_a, worker_b = ConnectionManager(), ConnectionManager()
        await api_a.start()
        try:
            ws = _fake_ws()
            await api_a.connect(ws, "alice")
            await asyncio.sleep(0.1)  # let the subscription settle
            await worker_b.broadcast_to_user("alice", {"type": "NEW_SCROBBLE"})
            assert await _wait_for(lambda: ws.send_json.await_count == 1)
            ws.send_json.assert_awaited_with({"type": "NEW_SCROBBLE"})
        finally:
            await api_a.stop()
            await worker_b.stop()

    asyncio.run(scenario())
