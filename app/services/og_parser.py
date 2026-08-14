import ipaddress
import re
import socket
import urllib.parse

import httpx

HTTPS_PREFIX = "https://"


def is_safe_url(url: str) -> bool:
    try:
        parsed_url = urllib.parse.urlparse(url)
        hostname = parsed_url.hostname
        if not hostname:
            return False

        # Fast fail for obvious internal domains/IPs
        if any(x in hostname.lower()
               for x in ["localhost", "local", "internal"]):
            return False

        # Resolve IP to check for private/loopback ranges
        addr_info = socket.getaddrinfo(hostname, None)
        for info in addr_info:
            ip_str = info[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_multicast:
                return False
        return True
    except Exception:
        return False


def _parse_yandex_artist(res: dict) -> tuple[str | None, str | None]:
    title = res.get("artist", {}).get("name")
    uri = res.get("artist", {}).get("cover", {}).get("uri")
    img = HTTPS_PREFIX + uri.replace("%%", "400x400") if uri else None
    return title, img


def _parse_yandex_album(res: dict) -> tuple[str | None, str | None]:
    title = res.get("title")
    uri = res.get("coverUri")
    img = HTTPS_PREFIX + uri.replace("%%", "400x400") if uri else None
    return title, img


def _parse_yandex_track(res: dict) -> tuple[str | None, str | None]:
    t_data = res.get("track", {})
    title = f"{t_data.get('artists', [{}])[0].get('name')} — {t_data.get('title')}" if t_data.get(
        'artists') else t_data.get('title')
    uri = t_data.get("coverUri") or res.get("coverUri")
    img = HTTPS_PREFIX + uri.replace("%%", "400x400") if uri else None
    return title, img


def _parse_generic_html(html_text: str) -> tuple[str | None, str | None]:
    title, img = None, None
    t_m = re.search(
        r'<meta\s+(?:property|name)=["\']og:title["\']\s+content=["\']([^"\']+)["\']',
        html_text,
        re.IGNORECASE)
    i_m = re.search(
        r'<meta\s+(?:property|name)=["\']og:image["\']\s+content=["\']([^"\']+)["\']',
        html_text,
        re.IGNORECASE)
    if t_m:
        title = t_m.group(1).split(' | ')[0]
    if i_m:
        img = i_m.group(1).replace(
            '200x200', '400x400').replace(
            '%%', '400x400')

    if not title:
        t_tag = re.search(
            r'<title>(.*?)</title>',
            html_text,
            re.IGNORECASE | re.DOTALL)
        if t_tag:
            title = t_tag.group(1).strip()
    return title, img


async def _parse_yandex_meta(
        client, url: str) -> tuple[str | None, str | None]:
    """Parse title and image from Yandex Music URL using their internal API."""
    try:
        if "/artist/" in url:
            artist_id = url.split('/artist/')[1].split('/')[0].split('?')[0]
            res = (await client.get(f"https://music.yandex.ru/handlers/artist.jsx?artist={artist_id}")).json()
            return _parse_yandex_artist(res)
        elif "/album/" in url and "/track/" not in url:
            album_id = url.split('/album/')[1].split('/')[0].split('?')[0]
            res = (await client.get(f"https://music.yandex.ru/handlers/album.jsx?album={album_id}")).json()
            return _parse_yandex_album(res)
        elif "/track/" in url:
            track_id = url.split('/track/')[1].split('/')[0].split('?')[0]
            res = (await client.get(f"https://music.yandex.ru/handlers/track.jsx?track={track_id}")).json()
            return _parse_yandex_track(res)
    except Exception as e:
        print(f"Yandex OG parsing error: {e}")
    return None, None


async def _parse_generic_meta(
        client, url: str) -> tuple[str | None, str | None]:
    """Fetch the page and extract OG meta tags from HTML."""
    from app.utils import is_safe_url
    if not is_safe_url(url):
        return None, None
    clean_url = "".join(chr(ord(c)) for c in str(url))
    try:
        req = client.build_request("GET", clean_url)
        resp = await client.send(req, follow_redirects=True)
        if resp.status_code == 200:
            return _parse_generic_html(resp.text)
    except Exception as e:
        print(f"Generic OG parsing error: {e}")
    return None, None


def _clean_banned_titles(title: str | None, img: str | None) -> tuple[str | None, str | None]:
    if not title:
        return None, img
    banned = (
        "Яндекс Музыка",
        "собираем музыку для вас",
        "Spotify – Web Player",
        "Spotify - Web Player",
    )
    if any(b in title for b in banned):
        return None, None
    return title, img


def _sanitize_url_for_request(raw_url: str) -> str:
    return "".join(chr(ord(c)) for c in str(raw_url))


async def _resolve_url_metadata(client: httpx.AsyncClient, current_url: str) -> tuple[str | None, str | None, str | None]:
    if not is_safe_url(current_url):
        return None, None, None

    clean_url = _sanitize_url_for_request(current_url)

    if "music.yandex.ru" in clean_url:
        title, img = await _parse_yandex_meta(client, clean_url)
        if title and img:
            return title, img, None

    try:
        resp = await client.get(clean_url)
        if 300 <= resp.status_code < 400 and 'Location' in resp.headers:
            next_url = resp.headers['Location']
            if not next_url.startswith('http'):
                import urllib.parse
                next_url = urllib.parse.urljoin(clean_url, next_url)
            if is_safe_url(next_url):
                return None, None, _sanitize_url_for_request(next_url)
            print(f"Blocked SSRF attempt on redirect to: {next_url}")
            return None, None, None
        if resp.status_code == 200:
            t_gen, i_gen = await _parse_generic_meta(client, clean_url)
            return t_gen, i_gen, None
    except httpx.RequestError:
        pass
    return None, None, None


async def parse_og_meta(url: str):
    if not url:
        return None, None
    if not url.startswith("http"):
        url = HTTPS_PREFIX + url

    # SSRF Protection using strict IP resolution (synchronous call is safe and
    # fast)
    if not is_safe_url(url):
        print(f"Blocked SSRF attempt for URL: {url}")
        return None, None

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    title, img = None, None

    async with httpx.AsyncClient(headers=headers, timeout=5.0, follow_redirects=False) as client:
        current_url = url
        for _ in range(3):
            t, i, next_url = await _resolve_url_metadata(client, current_url)
            if t or i:
                title, img = t, i
                break
            if next_url:
                current_url = next_url
            else:
                break

    return _clean_banned_titles(title, img)
