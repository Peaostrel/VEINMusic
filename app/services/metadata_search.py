import httpx
import urllib.parse
import re
from typing import Optional

TEXT_KEY = "#text"

async def _search_itunes(client: httpx.AsyncClient, query: str, itunes_entity: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
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

async def _search_genius(client: httpx.AsyncClient, query: str, entity_type: str, title: Optional[str], cover: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    try:
        genius_url = f"https://genius.com/api/search/multi?per_page=1&q={urllib.parse.quote(query.strip())}"
        r_genius = await client.get(genius_url)
        if r_genius.status_code != 200:
            return title, cover
            
        g_data = r_genius.json()
        sections = g_data.get('response', {}).get('sections', [])
        
        for section in sections:
            s_type = section.get('type')
            if s_type != entity_type and (entity_type not in ['artist', 'album'] and s_type != 'song'):
                continue
                
            hits = section.get('hits', [])
            if not hits:
                continue
                
            result = hits[0].get('result', {})
            if entity_type == 'artist':
                cover = cover or result.get('image_url')
                if not title:
                    raw_name = result.get('name', '')
                    title = re.sub(r'\([^)]*\)$', '', raw_name).strip()
            elif entity_type == 'album':
                cover = cover or result.get('cover_art_url')
                if not title:
                    artist_name = result.get('artist', {}).get('name', '')
                    album_name = result.get('name', '')
                    title = f"{artist_name} — {album_name}"
                    title = re.sub(r'\([^)]*\)$', '', title).strip()
            else:
                cover = cover or result.get('song_art_image_thumbnail_url') or result.get('header_image_url')
                if not title:
                    artist_name = result.get('primary_artist', {}).get('name', '')
                    song_title = result.get('title', '')
                    title = f"{artist_name} — {song_title}"
            break
    except Exception as e:
        print(f"Genius API Error: {e}")
    return title, cover

async def _search_lastfm(client: httpx.AsyncClient, query: str, entity_type: str, title: Optional[str], cover: Optional[str], lastfm_key: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    try:
        parts = [p.strip() for p in query.strip().replace('—', '-').split('-')]
        if len(parts) < 2:
            return title, cover, None
            
        artist = parts[0]
        item_name = parts[-1]
        ext_url = None
        
        if entity_type == 'album':
            l_url = f"https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key={lastfm_key}&artist={urllib.parse.quote(artist)}&album={urllib.parse.quote(item_name)}&format=json"
            r_l = await client.get(l_url)
            if r_l.status_code == 200:
                l_data = r_l.json().get('album', {})
                images = l_data.get('image', [])
                if images:
                    extralarge = next((img[TEXT_KEY] for img in images if img['size'] == 'extralarge' and img[TEXT_KEY]), None)
                    if extralarge: cover = extralarge
                if not title and l_data.get('name'):
                    title = f"{l_data.get('artist')} — {l_data.get('name')}"
                    ext_url = l_data.get('url')
        elif entity_type == 'track':
            l_url = f"https://ws.audioscrobbler.com/2.0/?method=track.getinfo&api_key={lastfm_key}&artist={urllib.parse.quote(artist)}&track={urllib.parse.quote(item_name)}&format=json"
            r_l = await client.get(l_url)
            if r_l.status_code == 200:
                l_data = r_l.json().get('track', {})
                album = l_data.get('album', {})
                images = album.get('image', [])
                if images:
                    extralarge = next((img[TEXT_KEY] for img in images if img['size'] == 'extralarge' and img[TEXT_KEY]), None)
                    if extralarge: cover = extralarge
                if not title and l_data.get('name'):
                    title = f"{l_data.get('artist', {}).get('name')} — {l_data.get('name')}"
                    ext_url = l_data.get('url')
        return title, cover, ext_url
    except Exception as e:
        print(f"Last.fm API Error: {e}")
    return title, cover, None

async def search_metadata(query: str, entity_type: str) -> tuple[str, str, str]:
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
