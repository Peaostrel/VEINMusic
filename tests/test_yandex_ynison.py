import asyncio
import base64
import hashlib
import json
import struct
from unittest.mock import patch

from app.services import yandex_ynison as yn

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

STATE = {"player_state": {
    "player_queue": {"current_playable_index": 1, "playable_list": [
        {"playable_id": "111", "playable_type": "TRACK"},
        {"playable_id": "222", "playable_type": "TRACK"}]},
    "status": {"paused": False, "progress_ms": 61500, "duration_ms": 200000,
               "version": {"timestamp_ms": 1_000_000}},
}}


def test_parse_state():
    assert yn.parse_state(STATE, now_ms=1_000_000) == yn.Playback("222", True, 61, 200)
    assert yn.parse_state({}) is None
    assert yn.parse_state({"player_state": {"player_queue": {"current_playable_index": -1}}}) is None
    video = {"player_state": {"player_queue": {"current_playable_index": 0, "playable_list": [
        {"playable_id": "v", "playable_type": "VIDEO"}]}}}
    assert yn.parse_state(video) is None


def _status(**kw):
    base = {"paused": False, "progress_ms": 10_000, "duration_ms": 200_000,
            "version": {"timestamp_ms": 1_000_000}}
    base.update(kw)
    return base


def test_position_is_extrapolated_while_playing():
    # 50 s after the last player event, playback has moved on by 50 s
    assert yn._position(_status(), 1_050_000) == (60_000, True)
    # Paused: the stored position, not playing
    assert yn._position(_status(paused=True), 1_050_000) == (10_000, False)
    # Past the end by less than the margin: still the same track finishing
    assert yn._position(_status(), 1_000_000 + 200_000) == (200_000, True)
    # Long past the end: the app was closed while playing
    assert yn._position(_status(), 1_000_000 + 600_000) == (200_000, False)
    # No timestamp: nothing to extrapolate from
    assert yn._position(_status(version={}), 1_050_000) == (10_000, True)
    assert yn._position({"progress_ms": "x"}, 0) == (0, False)


def _frame(payload: bytes) -> bytes:
    if len(payload) < 126:
        return bytes([0x81, len(payload)]) + payload
    return bytes([0x81, 126]) + struct.pack("!H", len(payload)) + payload


async def _read_frame(reader) -> bytes:
    b1, b2 = await reader.readexactly(2)
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack("!H", await reader.readexactly(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", await reader.readexactly(8))[0]
    mask = await reader.readexactly(4)
    data = await reader.readexactly(length)
    return bytes(c ^ mask[i % 4] for i, c in enumerate(data))


def test_fetch_playback_against_fake_ynison():
    """Handshake like Yandex's: credentials in Sec-WebSocket-Protocol, the
    server answers `Bearer`; first a redirect, then the player state."""
    seen = []

    async def server(reader, writer):
        head = (await reader.readuntil(b"\r\n\r\n")).decode()
        headers = dict(line.split(": ", 1) for line in head.split("\r\n")[1:] if ": " in line)
        path = head.split(" ")[1]
        seen.append((path, headers))
        accept = base64.b64encode(hashlib.sha1(
            (headers["Sec-WebSocket-Key"] + GUID).encode()).digest()).decode()
        writer.write((
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\nSec-WebSocket-Protocol: Bearer\r\n\r\n").encode())
        if path.startswith("/redirect"):
            reply = {"host": f"127.0.0.1:{port}", "redirect_ticket": "ticket-1"}
        else:
            hello = json.loads(await _read_frame(reader))
            assert hello["update_full_state"]["device"]["is_shadow"] is True
            reply = STATE
        writer.write(_frame(json.dumps(reply).encode()))
        await writer.drain()
        await asyncio.sleep(0.1)
        writer.close()

    async def run():
        nonlocal port
        srv = await asyncio.start_server(server, "127.0.0.1", 0)
        port = srv.sockets[0].getsockname()[1]
        with patch.object(yn, "REDIRECT_URL", f"ws://127.0.0.1:{port}/redirect"), \
                patch.object(yn, "STATE_URL", "ws://{host}/state"), \
                patch.object(yn.time, "time", return_value=1_000.0):
            result = await yn.fetch_playback("secret-token")
        srv.close()
        return result

    port = 0
    assert asyncio.run(run()) == yn.Playback("222", True, 61, 200)
    (_, first), (state_path, second) = seen
    assert state_path == "/state"
    assert first["Authorization"] == "OAuth secret-token"
    assert first["Sec-WebSocket-Protocol"].startswith("Bearer, v2, {")
    assert "ticket-1" in second["Sec-WebSocket-Protocol"]


def test_listen_gets_every_pushed_state():
    """The live connection passes on each state Ynison pushes, not only the first."""
    states = [STATE, {"player_state": {
        "player_queue": {"current_playable_index": 0, "playable_list": [{"playable_id": "333"}]},
        "status": {"paused": True, "progress_ms": 5000, "duration_ms": 100000}}}]

    async def server(reader, writer):
        head = (await reader.readuntil(b"\r\n\r\n")).decode()
        headers = dict(line.split(": ", 1) for line in head.split("\r\n")[1:] if ": " in line)
        path = head.split(" ")[1]
        accept = base64.b64encode(hashlib.sha1(
            (headers["Sec-WebSocket-Key"] + GUID).encode()).digest()).decode()
        writer.write((
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\nSec-WebSocket-Protocol: Bearer\r\n\r\n").encode())
        if path.startswith("/redirect"):
            writer.write(_frame(json.dumps({"host": f"127.0.0.1:{port}", "redirect_ticket": "t"}).encode()))
        else:
            await _read_frame(reader)  # hello
            for state in states:
                writer.write(_frame(json.dumps(state).encode()))
        await writer.drain()
        await asyncio.sleep(0.1)
        writer.close()

    got, opened = [], []

    async def on_playback(pb):
        got.append(pb)

    async def run():
        nonlocal port
        srv = await asyncio.start_server(server, "127.0.0.1", 0)
        port = srv.sockets[0].getsockname()[1]
        with patch.object(yn, "REDIRECT_URL", f"ws://127.0.0.1:{port}/redirect"), \
                patch.object(yn, "STATE_URL", "ws://{host}/state"), \
                patch.object(yn.time, "time", return_value=1_000.0):
            try:
                await yn.listen("tok", on_playback, on_open=lambda: opened.append(True))
            except Exception:
                pass  # the fake server just drops the connection
        srv.close()

    port = 0
    asyncio.run(run())
    assert opened == [True]
    assert got == [yn.Playback("222", True, 61, 200), yn.Playback("333", False, 5, 100)]


def test_error_state_raises():
    import pytest
    with pytest.raises(RuntimeError):
        yn._check({"error": {"message": "bad"}})


def test_parse_state_marks_unlisted_paused_player():
    state = {**STATE, "devices": [{"info": {"device_id": "app"}}]}
    state["player_state"] = {**STATE["player_state"],
                             "status": {**STATE["player_state"]["status"], "paused": True,
                                        "version": {"device_id": "web", "version": 3,
                                                    "timestamp_ms": 1_000_000}}}
    pb = yn.parse_state(state, now_ms=1_000_000)
    assert pb.pause_unknown is True and pb.playing is False
    assert pb.event == ("222", "web", 3, 1_000_000) and pb.event_ms == 1_000_000
    # Listed device, a playing status, or no device list: the flag is trusted
    state["devices"].append({"info": {"device_id": "web"}})
    assert yn.parse_state(state, now_ms=1_000_000).pause_unknown is False
    assert yn.parse_state(STATE, now_ms=1_000_000).pause_unknown is False
