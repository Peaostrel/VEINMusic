from html.parser import HTMLParser
import ipaddress
import urllib.parse


class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs = False
        self.text = []

    def handle_data(self, d):
        self.text.append(d)

    def get_data(self):
        return "".join(self.text)


def sanitize_text(text_val: str) -> str:
    if not text_val:
        return text_val
    stripper = _HTMLStripper()
    try:
        stripper.feed(text_val)
        clean = stripper.get_data()
    except Exception:
        clean = text_val
    return clean.replace('"', '&quot;').replace("'", '&#39;').replace('<', '&lt;').replace('>', '&gt;')


def is_safe_url(url: str, allowed_domains: list[str] | None = None) -> bool:
    """Validate URL to prevent SSRF by checking scheme, hostname, and resolving DNS to block private IPs."""
    import socket
    if not url:
        return False
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        if allowed_domains and hostname not in allowed_domains:
            return False

        if hostname == 'localhost' or hostname.endswith('.localhost'):
            return False

        # Resolve hostname to IP and check if it's private
        try:
            ip_str = socket.gethostbyname(hostname)
            ip = ipaddress.ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast:
                return False
        except (socket.gaierror, ValueError):
            return False  # DNS resolution failed or invalid IP

        return True
    except Exception:
        return False
