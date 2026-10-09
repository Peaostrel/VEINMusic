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


def _pinned_target(url: str, headers: dict | None) -> tuple[str, dict, dict]:
    """The URL rewritten to a vetted IP, with Host and SNI for the real name."""
    parts, ip = resolve_public_address(url)
    host_header = parts.netloc.rsplit("@", 1)[-1]  # drop any userinfo
    ip_host = f"[{ip}]" if isinstance(ipaddress.ip_address(ip.split("%")[0]), ipaddress.IPv6Address) else ip
    netloc = f"{ip_host}:{parts.port}" if parts.port else ip_host
    pinned_url = urllib.parse.urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))
    headers = dict(headers or {})
    headers["Host"] = host_header
    extensions = {"sni_hostname": parts.hostname} if parts.scheme == "https" else {}
    return pinned_url, headers, extensions


def _client(timeout: float) -> httpx.AsyncClient:
    # trust_env=False: an HTTP proxy would re-resolve the hostname itself,
    # defeating the pinning, so connect directly.
    return httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False)


async def pinned_request(method: str, url: str, *, timeout: float = 5.0, **kwargs: Any) -> httpx.Response:
    pinned_url, headers, extensions = await asyncio.to_thread(
        _pinned_target, url, kwargs.pop("headers", None))
    async with _client(timeout) as client:
        request = client.build_request(method, pinned_url, headers=headers, extensions=extensions, **kwargs)
        return await client.send(request)


async def pinned_download(url: str, *, max_bytes: int, timeout: float = 5.0,
                          deadline: float = 10.0) -> bytes | None:
    """GET a body of at most `max_bytes` within `deadline` seconds.

    The body is streamed and dropped as soon as it grows past the limit, so a
    huge or endless response can't fill memory or hold a worker (`timeout`
    alone only limits pauses between chunks). None for anything but a 200
    that fits.
    """
    pinned_url, headers, extensions = await asyncio.to_thread(_pinned_target, url, None)

    async def fetch() -> bytes | None:
        async with _client(timeout) as client:
            request = client.build_request("GET", pinned_url, headers=headers, extensions=extensions)
            response = await client.send(request, stream=True)
            try:
                declared = response.headers.get("content-length", "")
                if response.status_code != 200 or (declared.isdigit() and int(declared) > max_bytes):
                    return None
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        return None
                return bytes(body)
            finally:
                await response.aclose()

    try:
        return await asyncio.wait_for(fetch(), deadline)
    except TimeoutError:
        return None
