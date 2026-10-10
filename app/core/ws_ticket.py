"""Short-lived tickets that authenticate a WebSocket handshake.

The session cookie is SameSite=Strict and lives on the API host; some
browsers (Firefox) do not send it with a WebSocket handshake started from
the site's own subdomain. The page therefore asks for a ticket with a normal
credentialed request and passes it as ?ticket=… when opening the socket.
A ticket names one user, is signed with SECRET_KEY and expires in a minute.
"""
from __future__ import annotations

import hashlib
import hmac
import time

from app.core.security import SECRET_KEY

TICKET_TTL_SEC = 60


def _sign(username: str, expires: int, session_version: int) -> str:
    message = f"ws-ticket:{username}:{expires}:{session_version}".encode()
    return hmac.new(SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def issue_ticket(username: str, now: float | None = None, *, session_version: int = 0) -> str:
    expires = int((now if now is not None else time.time()) + TICKET_TTL_SEC)
    return f"{username}.{session_version}.{expires}.{_sign(username, expires, session_version)}"


def verify_ticket(ticket: str, now: float | None = None, *, session_version: int | None = None) -> str | None:
    """Return the username the ticket was issued for, or None."""
    try:
        username, version_str, expires_str, signature = ticket.rsplit(".", 3)
        version = int(version_str)
        expires = int(expires_str)
    except ValueError:
        return None
    if version < 0 or (session_version is not None and version != session_version):
        return None
    if not username or expires < (now if now is not None else time.time()):
        return None
    if not hmac.compare_digest(signature, _sign(username, expires, version)):
        return None
    return username
