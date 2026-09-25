"""Outbound HTTP to user-supplied URLs without SSRF / DNS-rebinding holes.

The hostname is resolved once, every resolved address must be public, and the
request is then sent to that exact IP (TLS still verifies the certificate for
the original hostname via SNI). A DNS answer that changes between the check
and the connection therefore can't redirect the request to an internal host.
Redirects are never followed.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
import urllib.parse
from typing import Any

import httpx

from app.utils import _is_public_ip


class UnsafeURLError(ValueError):
    pass


def resolve_public_address(url: str) -> tuple[urllib.parse.SplitResult, str]:
    """Validate the URL and return it with one vetted IP address to connect to."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise UnsafeURLError("Only absolute http(s) URLs are allowed")
    host = parts.hostname.rstrip(".").lower()
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise UnsafeURLError("Internal hostnames are not allowed")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError) as exc:
        raise UnsafeURLError("Hostname does not resolve") from exc
    addresses = [str(info[4][0]) for info in infos]
    if not addresses or not all(_is_public_ip(a) for a in addresses):
        raise UnsafeURLError("URL resolves to a non-public address")
    return parts, addresses[0]


async def pinned_request(method: str, url: str, *, timeout: float = 5.0, **kwargs: Any) -> httpx.Response:
    parts, ip = await asyncio.to_thread(resolve_public_address, url)
    host_header = parts.netloc.rsplit("@", 1)[-1]  # drop any userinfo
    ip_host = f"[{ip}]" if isinstance(ipaddress.ip_address(ip.split("%")[0]), ipaddress.IPv6Address) else ip
    netloc = f"{ip_host}:{parts.port}" if parts.port else ip_host
    pinned_url = urllib.parse.urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))

    headers = dict(kwargs.pop("headers", None) or {})
    headers["Host"] = host_header
    extensions = {"sni_hostname": parts.hostname} if parts.scheme == "https" else {}
    # trust_env=False: an HTTP proxy would re-resolve the hostname itself,
    # defeating the pinning, so connect directly.
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False) as client:
        request = client.build_request(method, pinned_url, headers=headers, extensions=extensions, **kwargs)
        return await client.send(request)
