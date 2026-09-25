import ipaddress
import urllib.parse
from html.parser import HTMLParser


class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []

    def handle_data(self, d):
        self.text.append(d)

    def get_data(self):
        return "".join(self.text)


def sanitize_text(text_val: str) -> str:
    """Strip HTML tags and return plain text.

    The result is stored as plain text: it must be escaped by whatever renders
    it (React does this automatically; SVG widgets use html.escape). Entities
    are decoded here rather than re-encoded, otherwise the UI would show
    literal "&#39;" / "&quot;" sequences."""
    if not text_val:
        return text_val
    stripper = _HTMLStripper()
    try:
        stripper.feed(text_val)
        stripper.close()
        return stripper.get_data()
    except Exception:
        return text_val.replace('<', '').replace('>', '')


def _is_public_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str.split('%', 1)[0])
    except ValueError:
        return False
    # IPv4-mapped IPv6 addresses (::ffff:127.0.0.1) must be judged as IPv4
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def is_safe_url(url: str, allowed_domains: list[str] | None = None) -> bool:
    """Validate URL to prevent SSRF: http(s) only, optional host allowlist, and
    every address the hostname resolves to (IPv4 and IPv6) must be public."""
    import socket
    if not url:
        return False
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False

        hostname = (parsed.hostname or "").rstrip('.').lower()
        if not hostname:
            return False

        if allowed_domains and hostname not in allowed_domains:
            return False

        if hostname == 'localhost' or hostname.endswith(('.localhost', '.local', '.internal')):
            return False

        try:
            infos = socket.getaddrinfo(hostname, parsed.port or None, proto=socket.IPPROTO_TCP)
        except (socket.gaierror, UnicodeError, ValueError):
            return False  # DNS resolution failed or invalid host
        addresses = {str(info[4][0]) for info in infos}
        return bool(addresses) and all(_is_public_ip(a) for a in addresses)
    except Exception:
        return False
