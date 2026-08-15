"""WebSocket Connection and 'Listen Together' Room Manager."""
from __future__ import annotations

import time
from typing import Any, Optional
from fastapi import WebSocket


class TogetherRoom:
    """State for a single Listen Together room."""

    def __init__(self, room_id: str, name: str, host_username: str):
        self.room_id = room_id
        self.name = name
        self.host_username = host_username
        self.listeners: dict[str, WebSocket] = {}
        self.current_track: dict[str, Any] = {
            "title": "Ожидание трека от DJ...",
            "artist": host_username,
            "album": "",
            "cover_url": "",
            "duration": 180,
            "progress_sec": 0,
            "is_playing": False,
            "updated_at": time.time(),
        }
        self.chat_messages: list[dict[str, Any]] = []

    def add_listener(self, username: str, websocket: WebSocket) -> None:
        self.listeners[username] = websocket

    def remove_listener(self, username: str) -> None:
        self.listeners.pop(username, None)

    async def broadcast(self, message: dict[str, Any], exclude_user: Optional[str] = None) -> None:
        for user, ws in self.listeners.copy().items():
            if user == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                pass


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.together_rooms: dict[str, TogetherRoom] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        if username not in self.active_connections:
            self.active_connections[username] = []
        self.active_connections[username].append(websocket)

    def disconnect(self, websocket: WebSocket, username: str):
        if username in self.active_connections:
            if websocket in self.active_connections[username]:
                self.active_connections[username].remove(websocket)
            if not self.active_connections[username]:
                del self.active_connections[username]

    async def broadcast_to_user(self, username: str, message: dict):
        if username in self.active_connections:
            for connection in self.active_connections[username]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    import logging
                    logging.debug(f"Failed to send WS message to {username}: {e}")

    # --- Listen Together Room Methods ---

    def get_or_create_room(self, room_id: str, name: str = "", host_username: str = "DJ") -> TogetherRoom:
        if room_id not in self.together_rooms:
            self.together_rooms[room_id] = TogetherRoom(
                room_id=room_id,
                name=name or f"Комната {room_id}",
                host_username=host_username,
            )
        return self.together_rooms[room_id]

    def get_active_rooms_info(self) -> list[dict[str, Any]]:
        rooms = []
        for r in self.together_rooms.values():
            rooms.append({
                "room_id": r.room_id,
                "name": r.name,
                "host_username": r.host_username,
                "listeners_count": len(r.listeners),
                "listeners": list(r.listeners.keys()),
                "current_track": r.current_track,
            })
        return rooms


manager = ConnectionManager()
