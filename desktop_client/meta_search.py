"""Metadata enricher for Desktop Client using Deezer and iTunes public APIs."""
from __future__ import annotations

import difflib
import json
import re
import ssl
import urllib.parse
import urllib.request

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[\(\[\{].*?[\)\]\}]", "", text)
    text = re.sub(r"[^\w\s\-\.]", " ", text)
    return " ".join(text.split()).strip()


def enrich_track_meta(title: str, artist: str) -> dict:
    """Find cover art, album, and track url via Deezer and iTunes."""
    q_title = clean_text(title)
    q_artist = clean_text(artist)
    query = f"{q_artist} {q_title}".strip() or title

    # Try Deezer
    try:
        url = f"https://api.deezer.com/search?q={urllib.parse.quote(query)}&limit=5"
        req = urllib.request.Request(url, headers={"User-Agent": "VEINMusic/2.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            items = data.get("data", [])
            if items:
                first = items[0]
                album = first.get("album", {})
                cover = (
                    album.get("cover_xl")
                    or album.get("cover_big")
                    or album.get("cover_medium")
                    or ""
                )
                return {
                    "title": first.get("title") or title,
                    "artist": first.get("artist", {}).get("name") or artist,
                    "album": album.get("title") or "",
                    "cover_url": cover,
                    "track_url": first.get("link") or "",
                }
    except Exception:
        pass

    # Try iTunes fallback
    try:
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&media=music&entity=song&limit=5"
        req = urllib.request.Request(url, headers={"User-Agent": "VEINMusic/2.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results = data.get("results", [])
            if results:
                first = results[0]
                artwork = first.get("artworkUrl100", "").replace(
                    "100x100bb", "600x600bb"
                )
                return {
                    "title": first.get("trackName") or title,
                    "artist": first.get("artistName") or artist,
                    "album": first.get("collectionName") or "",
                    "cover_url": artwork,
                    "track_url": first.get("trackViewUrl") or "",
                }
    except Exception:
        pass

    return {
        "title": title,
        "artist": artist,
        "album": "",
        "cover_url": "",
        "track_url": "",
    }
