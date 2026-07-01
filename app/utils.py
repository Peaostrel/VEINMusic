import urllib.parse
import ipaddress


def sanitize_text(text_val: str) -> str:
    if not text_val:
        return text_val
    # Remove HTML tags without regex
    while '<' in text_val and '>' in text_val:
        start = text_val.find('<')
        end = text_val.find('>', start)
        if end != -1:
            text_val = text_val[:start] + text_val[end+1:]
        else:
            break
    # Escape quotes and brackets
    return text_val.replace(
        '"',
        '&quot;').replace(
        "'",
        '&#39;').replace(
            '<',
            '&lt;').replace(
                '>',
                '&gt;')


def is_safe_url(url: str, allowed_domains: list[str] | None = None) -> bool:
    """Validate URL to prevent SSRF by checking scheme, hostname, and private IPs."""
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

        # If hostname is an IP, check if it's private
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast:
                return False
        except ValueError:
            pass  # It's a domain name, not an IP

        return True
    except Exception:
        return False
