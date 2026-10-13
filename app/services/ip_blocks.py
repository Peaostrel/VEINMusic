"""Temporary blocks of client addresses, set by administrators.

Meant against an ongoing attack (a flood, password guessing), not against a
person: addresses are shared (mobile carriers, offices) and change, so every
block expires. The list is small and checked on every request, so each
process keeps it in memory and rereads it every few seconds.
"""
from __future__ import annotations

import ipaddress
import threading
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import IpBlock

REFRESH_SEC = 10
MAX_DAYS = 365
# Narrower than this would block a whole provider or country
MIN_PREFIX = {4: 16, 6: 32}

Network = ipaddress.IPv4Network | ipaddress.IPv6Network

_networks: list[Network] = []
_loaded_at = 0.0
_lock = threading.Lock()


class BlockError(ValueError):
    """The address can't be blocked; the message says why."""


def parse_network(value: str, admin_ip: str | None = None) -> Network:
    try:
        network = ipaddress.ip_network(value.strip(), strict=False)
    except ValueError as exc:
        raise BlockError("Это не IP-адрес и не подсеть") from exc
    if network.is_private or network.is_loopback or network.is_link_local or network.is_reserved:
        # The site's own servers and Docker live there
        raise BlockError("Внутренние адреса блокировать нельзя")
    if network.prefixlen < MIN_PREFIX[network.version]:
        raise BlockError(
            f"Слишком широкая подсеть: не шире /{MIN_PREFIX[network.version]}")
    if _contains(network, admin_ip):
        raise BlockError("Под блокировку попадает ваш собственный адрес")
    return network


def _contains(network: Network, ip: str | None) -> bool:
    try:
        return ip is not None and ipaddress.ip_address(ip) in network
    except ValueError:
        return False


def add(db: Session, value: str, *, hours: int, reason: str, admin: str,
        admin_ip: str | None = None) -> IpBlock:
    network = parse_network(value, admin_ip)
    hours = max(1, min(int(hours), MAX_DAYS * 24))
    now = datetime.now(UTC)
    block = IpBlock(network=str(network), reason=reason.strip()[:200], created_by=admin,
                    created_at=now, expires_at=now + timedelta(hours=hours))
    db.add(block)
    db.flush()
    invalidate()
    return block


def active(db: Session) -> list[IpBlock]:
    return (db.query(IpBlock)
            .filter(IpBlock.expires_at > datetime.now(UTC))
            .order_by(IpBlock.created_at.desc())
            .all())


def invalidate() -> None:
    global _loaded_at
    _loaded_at = 0.0


def _load() -> list[Network]:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        rows = db.query(IpBlock.network).filter(IpBlock.expires_at > datetime.now(UTC)).all()
    finally:
        db.close()
    networks: list[Network] = []
    for (value,) in rows:
        try:
            networks.append(ipaddress.ip_network(value, strict=False))
        except ValueError:
            continue
    return networks


def _current() -> list[Network]:
    """The active networks, reread from the database every REFRESH_SEC."""
    global _networks, _loaded_at
    if time.monotonic() - _loaded_at < REFRESH_SEC:
        return _networks
    with _lock:
        if time.monotonic() - _loaded_at >= REFRESH_SEC:
            try:
                _networks = _load()
            except Exception:  # keep serving with the last known list
                pass
            _loaded_at = time.monotonic()
    return _networks


def needs_refresh() -> bool:
    return time.monotonic() - _loaded_at >= REFRESH_SEC


def refresh() -> None:
    _current()


def is_blocked(ip: str) -> bool:
    """Uses the list in memory; call refresh() (off the event loop) first."""
    networks = _networks
    if not networks:
        return False
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(address in network for network in networks)


def reset() -> None:
    """Tests: forget the list kept in memory."""
    global _networks
    _networks = []
    invalidate()
