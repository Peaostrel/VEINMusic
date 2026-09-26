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
    "status": {"paused": False, "progress_ms": 61500, "duration_ms": 200000},
}}


def test_parse_state():
    assert yn.parse_state(STATE) == yn.Playback("222", False, 61, 200)
    assert yn.parse_state({}) is None
    assert yn.parse_state({"player_state": {"player_queue": {"current_playable_index": -1}}}) is None
    video = {"player_state": {"player_queue": {"current_playable_index": 0, "playable_list": [
        {"playable_id": "v", "playable_type": "VIDEO"}]}}}
    assert yn.parse_state(video) is None


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
                patch.object(yn, "STATE_URL", "ws://{host}/state"):
            result = await yn.fetch_playback("secret-token")
        srv.close()
        return result

    port = 0
    assert asyncio.run(run()) == yn.Playback("222", False, 61, 200)
    (_, first), (state_path, second) = seen
    assert state_path == "/state"
    assert first["Authorization"] == "OAuth secret-token"
    assert first["Sec-WebSocket-Protocol"].startswith("Bearer, v2, {")
    assert "ticket-1" in second["Sec-WebSocket-Protocol"]
