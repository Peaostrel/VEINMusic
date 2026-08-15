import re
import urllib.parse

import httpx

TEXT_KEY = "#text"

PAREN_RE = re.compile(r' \([^)]*\)')
END_PAREN_RE = re.compile(r'\([^)]*\)$')
FEAT_RE = re.compile(r'(?i) feat\.?| ft\.?| &|,| x ')


async def _search_itunes(client: httpx.AsyncClient,
                         query: str,
                         itunes_entity: str) -> tuple[str | None,
                                                      str | None,
                                                      str | None]:
    url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query.strip())}&entity={itunes_entity}&limit=1"
    try:
        r = await client.get(url)
        if r.status_code == 200:
            data = r.json()
            if data.get('resultCount', 0) > 0:
                item = data['results'][0]
                name = item.get('artistName', '')
                if itunes_entity == 'song':
                    title = f"{name} — {item.get('trackName', '')}"
                    ext_url = item.get('trackViewUrl')
                elif itunes_entity == 'album':
                    title = f"{name} — {item.get('collectionName', '')}"
                    ext_url = item.get('collectionViewUrl')
                else:
                    title = name
                    ext_url = item.get('artistLinkUrl')
                cover = item.get('artworkUrl100', '')
                if cover:
                    cover = cover.replace('100x100bb.jpg', '600x600bb.jpg')
                return title, cover, ext_url
    except Exception as e:
        print(f"iTunes API Error: {e}")
    return None, None, None


def _apply_genius_hit(result: dict,
                      entity_type: str,
                      title: str | None,
                      cover: str | None) -> tuple[str | None,
                                                  str | None]:
    """Apply a Genius search hit to update title/cover based on entity type."""
    if entity_type == 'artist':
        cover = cover or result.get('image_url')
        if not title:
            raw_name = result.get('name', '')
            title = END_PAREN_RE.sub('', raw_name).strip()
    elif entity_type == 'album':
        cover = cover or result.get('cover_art_url')
        if not title:
            artist_name = result.get('artist', {}).get('name', '')
            album_name = result.get('name', '')
            title = re.sub(r'\([^)]*\)$', '',
                           f"{artist_name} — {album_name}").strip()
    else:
        cover = cover or result.get(
            'song_art_image_thumbnail_url') or result.get('header_image_url')
        if not title:
            artist_name = result.get('primary_artist', {}).get('name', '')
            song_title = result.get('title', '')
            title = f"{artist_name} — {song_title}"
    return title, cover


async def _search_genius(client: httpx.AsyncClient,
                         query: str,
                         entity_type: str,
                         title: str | None,
                         cover: str | None) -> tuple[str | None,
                                                     str | None]:
    try:
        genius_url = f"https://genius.com/api/search/multi?per_page=1&q={urllib.parse.quote(query.strip())}"
        r_genius = await client.get(genius_url)
        if r_genius.status_code != 200:
            return title, cover
        sections = r_genius.json().get('response', {}).get('sections', [])
        for section in sections:
            s_type = section.get('type')
            type_match = (
                s_type == entity_type) or (
                entity_type not in [
                    'artist',
                    'album'] and s_type == 'song')
            if not type_match:
                continue
            hits = section.get('hits', [])
            if hits:
                title, cover = _apply_genius_hit(hits[0].get(
                    'result', {}), entity_type, title, cover)
                break
    except Exception as e:
        print(f"Genius API Error: {e}")
    return title, cover


def _get_lastfm_extralarge(images: list) -> str | None:
    """Extract extralarge image URL from a Last.fm image list."""
    return next((img[TEXT_KEY] for img in images if img.get(
        'size') == 'extralarge' and img.get(TEXT_KEY)), None)


async def _fetch_lastfm_album(client: httpx.AsyncClient,
                              artist: str,
                              item_name: str,
                              title: str | None,
                              cover: str | None,
                              lastfm_key: str) -> tuple[str | None,
                                                        str | None,
                                                        str | None]:
    l_url = (
        f"https://ws.audioscrobbler.com/2.0/?method=album.getinfo"
        f"&api_key={lastfm_key}&artist={urllib.parse.quote(artist)}"
        f"&album={urllib.parse.quote(item_name)}&format=json"
    )
    ext_url = None
    r_l = await client.get(l_url)
    if r_l.status_code == 200:
        l_data = r_l.json().get('album', {})
        extralarge = _get_lastfm_extralarge(l_data.get('image', []))
        if extralarge:
            cover = extralarge
        if not title and l_data.get('name'):
            title = f"{l_data.get('artist')} — {l_data.get('name')}"
            ext_url = l_data.get('url')
    return title, cover, ext_url


async def _fetch_lastfm_track(client: httpx.AsyncClient,
                              artist: str,
                              item_name: str,
                              title: str | None,
                              cover: str | None,
                              lastfm_key: str) -> tuple[str | None,
                                                        str | None,
                                                        str | None]:
    l_url = (
        f"https://ws.audioscrobbler.com/2.0/?method=track.getinfo"
        f"&api_key={lastfm_key}&artist={urllib.parse.quote(artist)}"
        f"&track={urllib.parse.quote(item_name)}&format=json"
    )
    ext_url = None
    r_l = await client.get(l_url)
    if r_l.status_code == 200:
        l_data = r_l.json().get('track', {})
        extralarge = _get_lastfm_extralarge(
            l_data.get(
                'album', {}).get(
                'image', []))
        if extralarge:
            cover = extralarge
        if not title and l_data.get('name'):
            title = f"{l_data.get('artist', {}).get('name')} — {l_data.get('name')}"
            ext_url = l_data.get('url')
    return title, cover, ext_url


async def _search_lastfm(client: httpx.AsyncClient,
                         query: str,
                         entity_type: str,
                         title: str | None,
                         cover: str | None,
                         lastfm_key: str) -> tuple[str | None,
                                                   str | None,
                                                   str | None]:
    try:
        parts = [p.strip() for p in query.strip().replace('—', '-').split('-')]
        if len(parts) < 2:
            return title, cover, None
        artist = parts[0]
        item_name = parts[-1]
        if entity_type == 'album':
            return await _fetch_lastfm_album(client, artist, item_name, title, cover, lastfm_key)
        if entity_type == 'track':
            return await _fetch_lastfm_track(client, artist, item_name, title, cover, lastfm_key)
    except Exception as e:
        print(f"Last.fm API Error: {e}")
    return title, cover, None


async def search_metadata(
        query: str, entity_type: str) -> tuple[str | None, str | None, str | None]:
    if not query or not query.strip():
        return None, None, None

    itunes_entity = {
        'artist': 'musicArtist',
        'track': 'song',
        'album': 'album'
    }.get(entity_type, 'song')

    async with httpx.AsyncClient(timeout=5.0) as client:
        title, cover, ext_url = await _search_itunes(client, query, itunes_entity)

        if not cover or not title:
            title, cover = await _search_genius(client, query, entity_type, title, cover)

        if (not cover or not title) and entity_type in ['track', 'album']:
            import os
            lastfm_key = os.getenv("LASTFM_API_KEY")
            if lastfm_key:
                title, cover, lastfm_ext = await _search_lastfm(client, query, entity_type, title, cover, lastfm_key)
                ext_url = ext_url or lastfm_ext

    return title, cover, ext_url


async def search_suggestions(query: str, entity_type: str) -> list[dict]:  # NOSONAR
    if not query or not query.strip():
        return []

    import os

    lastfm_key = os.getenv("LASTFM_API_KEY")
    genius_token = os.getenv("GENIUS_ACCESS_TOKEN")
    # Pre-compile regexes to constants to avoid SonarQube complaints about duplication and backtracking
    # Use possessive or non-backtracking patterns where possible, or just simpler ones
    # Use possessive or non-backtracking patterns where possible, or just simpler ones
    results: list[dict] = []

    def get_lf_image(images):
        if not images or not isinstance(images, list):
            return ""
        for img in reversed(images):
            url = img.get("#text", "")
            if url and "2a96cbd8b46e442fc41c2b86b821562f" not in url:
                return url
        return ""

    async with httpx.AsyncClient(timeout=3.0) as client:
        # 1. Try Genius API first if available (excellent for artists and tracks)
        if genius_token:
            try:
                url = f"https://api.genius.com/search?q={urllib.parse.quote(query.strip())}"
                headers = {"Authorization": f"Bearer {genius_token}"}
                r = await client.get(url, headers=headers)
                if r.status_code == 200:
                    hits = r.json().get('response', {}).get('hits', [])
                    for hit in hits:
                        if hit.get('type') == 'song':
                            res = hit.get('result', {})

                            if entity_type == 'artist':
                                artist = res.get('primary_artist', {})
                                name = artist.get('name', '')
                                if name:
                                    name = PAREN_RE.sub('', name).strip()
                                img = artist.get('image_url', '')
                                if name and not any(r['title'].lower() == name.lower() for r in results):
                                    results.append({"title": name, "image": img or ""})
                                    if len(results) >= 5:
                                        break

                            elif entity_type == 'track':
                                artist = res.get('primary_artist', {}).get('name', '')
                                if artist:
                                    artist = PAREN_RE.sub('', artist).strip()
                                title = res.get('title', '')
                                if title:
                                    title = PAREN_RE.sub('', title).strip()
                                img = res.get('song_art_image_thumbnail_url', '')
                                full_title = f"{artist} — {title}"
                                if artist and title and not any(r['title'].lower() == full_title.lower() for r in results):
                                    results.append({"title": full_title, "image": img or ""})
                                    if len(results) >= 5:
                                        break
            except Exception as e:
                print(f"Genius Parse Error: {e}")

        # 2. Try Last.fm (if Genius didn't get enough results or for albums)
        if lastfm_key and len(results) < 5:
            try:
                if entity_type == 'artist':
                    url = f"https://ws.audioscrobbler.com/2.0/?method=artist.search&artist={urllib.parse.quote(query.strip())}&api_key={lastfm_key}&format=json&limit=15"
                    r = await client.get(url)
                    if r.status_code == 200:
                        matches = r.json().get('results', {}).get('artistmatches', {}).get('artist', [])

                        for item in matches:
                            raw_name = item.get('name')
                            if not raw_name:
                                continue
                            cleaned = FEAT_RE.split(raw_name)[0].strip()
                            if not any(r['title'].lower() == cleaned.lower() for r in results):
                                results.append({
                                    "title": cleaned,
                                    "image": get_lf_image(item.get('image'))
                                })
                                if len(results) >= 5:
                                    break

                        # Fetch artist images from iTunes concurrently since Last.fm hides them
                        import asyncio

                        async def fetch_itunes_img(artist_dict):
                            if artist_dict["image"]:
                                return artist_dict
                            try:
                                url = f"https://itunes.apple.com/search?term={urllib.parse.quote(artist_dict['title'])}&entity=musicArtist&limit=1&country=ru"
                                r = await client.get(url)
                                if r.status_code == 200:
                                    data = r.json().get("results", [])
                                    if data:
                                        artist_dict["image"] = data[0].get(
                                            "artworkUrl100", "") or data[0].get("artworkUrl60", "")
                            except Exception:
                                pass
                            return artist_dict

                        results = await asyncio.gather(*(fetch_itunes_img(r) for r in results))
                        results = list(results)
                elif entity_type == 'track' and len(results) < 5:
                    url = f"https://ws.audioscrobbler.com/2.0/?method=track.search&track={urllib.parse.quote(query.strip())}&api_key={lastfm_key}&format=json&limit=15"
                    r = await client.get(url)
                    if r.status_code == 200:
                        matches = r.json().get('results', {}).get('trackmatches', {}).get('track', [])
                        for item in matches:
                            artist = item.get('artist', '')
                            if artist:
                                artist = PAREN_RE.sub('', artist).strip()
                            track_name = item.get('name', '')
                            if track_name:
                                track_name = PAREN_RE.sub('', track_name).strip()
                            title = f"{artist} — {track_name}"
                            if not any(r['title'].lower() == title.lower() for r in results):
                                results.append({
                                    "title": title,
                                    "image": get_lf_image(item.get('image'))
                                })
                                if len(results) >= 5:
                                    break
                elif entity_type == 'album' and len(results) < 5:
                    url = f"https://ws.audioscrobbler.com/2.0/?method=album.search&album={urllib.parse.quote(query.strip())}&api_key={lastfm_key}&format=json&limit=15"
                    r = await client.get(url)
                    if r.status_code == 200:
                        matches = r.json().get('results', {}).get('albummatches', {}).get('album', [])
                        for item in matches:
                            artist = item.get('artist', '')
                            if artist:
                                artist = PAREN_RE.sub('', artist).strip()
                            album_name = item.get('name', '')
                            if album_name:
                                album_name = PAREN_RE.sub('', album_name).strip()
                            title = f"{artist} — {album_name}"
                            if not any(r['title'].lower() == title.lower() for r in results):
                                results.append({
                                    "title": title,
                                    "image": get_lf_image(item.get('image'))
                                })
                                if len(results) >= 5:
                                    break
            except Exception as e:
                print(f"Last.fm Suggestion API Error: {e}")

        # 3. Fallback to iTunes API
        if len(results) < 5:
            try:
                itunes_entity = 'musicArtist'
                if entity_type == 'track':
                    itunes_entity = 'song'
                elif entity_type == 'album':
                    itunes_entity = 'album'

                url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query.strip())}&entity={itunes_entity}&limit={10 if entity_type != 'artist' else 5}&country=ru&lang=ru_ru"
                r = await client.get(url)
                if r.status_code == 200:
                    data = r.json().get('results', [])
                    for item in data:
                        if len(results) >= 5:
                            break
                        name = item.get('artistName', '')
                        if not name:
                            continue
                        name = PAREN_RE.sub('', name).strip()
                        if itunes_entity == 'song':
                            track_name = item.get('trackName', '')
                            track_name = PAREN_RE.sub('', track_name).strip()
                            title = f"{name} — {track_name}"
                        elif itunes_entity == 'album':
                            col_name = item.get('collectionName', '')
                            col_name = PAREN_RE.sub('', col_name).strip()
                            title = f"{name} — {col_name}"
                        else:
                            title = name
                        if not any(r['title'].lower() == title.lower() for r in results):
                            img = item.get('artworkUrl100', '') or item.get('artworkUrl60', '')
                            results.append({
                                "title": title,
                                "image": img
                            })
            except Exception as e:
                print(f"iTunes Suggestion API Error: {e}")
    return results


async def search_musicbrainz_metadata(artist: str, title: str) -> dict[str, str | None]:
    """Search MusicBrainz API for MBID, ISRC, and canonical release metadata."""
    query = f'artist:"{artist}" AND recording:"{title}"'
    url = f"https://musicbrainz.org/ws/2/recording/?query={urllib.parse.quote(query)}&fmt=json&limit=1"
    headers = {"User-Agent": "VEINMusic/2.0 ( contact@vein.guru )"}

    try:
        async with httpx.AsyncClient(timeout=4.0, headers=headers) as client:
            res = await client.get(url)
            if res.status_code == 200:
                recordings = res.json().get("recordings", [])
                if recordings:
                    rec = recordings[0]
                    mbid = rec.get("id")
                    isrcs = rec.get("isrcs", [])
                    isrc = isrcs[0] if isrcs else None
                    releases = rec.get("releases", [])
                    release_title = releases[0].get("title") if releases else None
                    return {
                        "mbid": mbid,
                        "isrc": isrc,
                        "canonical_title": rec.get("title"),
                        "release_title": release_title,
                    }
    except Exception as e:
        print(f"[MusicBrainz] Error: {e}")
    return {"mbid": None, "isrc": None, "canonical_title": None, "release_title": None}
