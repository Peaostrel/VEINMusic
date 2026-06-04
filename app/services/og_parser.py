import urllib.parse
import re
import httpx
import ipaddress
import socket

async def is_safe_url(url: str) -> bool:
    try:
        parsed_url = urllib.parse.urlparse(url)
        hostname = parsed_url.hostname
        if not hostname: return False
        
        # Fast fail for obvious internal domains/IPs
        if any(x in hostname.lower() for x in ["localhost", "local", "internal"]):
            return False
            
        # Resolve IP to check for private/loopback ranges
        # socket.getaddrinfo returns a list of tuples: (family, type, proto, canonname, sockaddr)
        # sockaddr for IPv4 is (address, port) and for IPv6 is (address, port, flow info, scope id)
        addr_info = socket.getaddrinfo(hostname, None)
        for info in addr_info:
            ip_str = info[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_multicast:
                return False
        return True
    except Exception:
        return False

async def parse_og_meta(url: str):
    if not url: return None, None
    if not url.startswith("http"): url = "https://" + url
    
    # SSRF Protection using strict IP resolution
    if not await is_safe_url(url):
        print(f"Blocked SSRF attempt for URL: {url}")
        return None, None

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    title, img = None, None
    
    async with httpx.AsyncClient(headers=headers, timeout=5.0, follow_redirects=True) as client:
        if "music.yandex.ru" in url:
            try:
                if "/artist/" in url:
                    artist_id = url.split('/artist/')[1].split('/')[0].split('?')[0]
                    res = (await client.get(f"https://music.yandex.ru/handlers/artist.jsx?artist={artist_id}")).json()
                    title = res.get("artist", {}).get("name")
                    uri = res.get("artist", {}).get("cover", {}).get("uri")
                    img = "https://" + uri.replace("%%", "400x400") if uri else None
                elif "/album/" in url and "/track/" not in url:
                    album_id = url.split('/album/')[1].split('/')[0].split('?')[0]
                    res = (await client.get(f"https://music.yandex.ru/handlers/album.jsx?album={album_id}")).json()
                    title = res.get("title")
                    uri = res.get("coverUri")
                    img = "https://" + uri.replace("%%", "400x400") if uri else None
                elif "/track/" in url:
                    track_id = url.split('/track/')[1].split('/')[0].split('?')[0]
                    res = (await client.get(f"https://music.yandex.ru/handlers/track.jsx?track={track_id}")).json()
                    t_data = res.get("track", {})
                    title = f"{t_data.get('artists', [{}])[0].get('name')} — {t_data.get('title')}" if t_data.get('artists') else t_data.get('title')
                    uri = t_data.get("coverUri") or res.get("coverUri")
                    img = "https://" + uri.replace("%%", "400x400") if uri else None
            except Exception as e:
                print(f"Yandex OG parsing error: {e}")
        
        if not title or not img:
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    t_m = re.search(r'<meta\s+(?:property|name)=["\']og:title["\']\s+content=["\']([^"\']+)["\']', resp.text, re.IGNORECASE)
                    i_m = re.search(r'<meta\s+(?:property|name)=["\']og:image["\']\s+content=["\']([^"\']+)["\']', resp.text, re.IGNORECASE)
                    if not title and t_m: title = t_m.group(1).split(' | ')[0]
                    if not img and i_m: img = i_m.group(1).replace('200x200', '400x400').replace('%%', '400x400')
                    
                    if not title:
                        t_tag = re.search(r'<title>(.*?)</title>', resp.text, re.IGNORECASE | re.DOTALL)
                        if t_tag: title = t_tag.group(1).strip()
            except Exception as e:
                print(f"Generic OG parsing error: {e}")
                
    # Filter generic titles
    if title:
        banned = ["Яндекс Музыка", "собираем музыку для вас", "Spotify – Web Player", "Spotify - Web Player"]
        if any(b in title for b in banned):
            title = None
            img = None # Also clear image if it's generic

    return title, img

