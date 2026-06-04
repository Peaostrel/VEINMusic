import httpx
import urllib.parse
import re

async def search_metadata(query: str, entity_type: str) -> tuple[str, str, str]:
    """
    Search for metadata using iTunes API and Genius API (for artist images).
    entity_type can be 'artist', 'track', or 'album'.
    Returns (title, cover_url, external_url)
    """
    if not query or not query.strip():
        return None, None, None
        
    itunes_entity = {
        'artist': 'musicArtist',
        'track': 'song',
        'album': 'album'
    }.get(entity_type, 'song')
    
    url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query.strip())}&entity={itunes_entity}&limit=1"
    
    title = None
    cover = None
    ext_url = None
    
    async with httpx.AsyncClient(timeout=5.0) as client:
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
        except Exception as e:
            print(f"iTunes API Error: {e}")
            
        # If cover is missing or it's an artist search, try Genius API
        if not cover or not title:
            try:
                genius_url = f"https://genius.com/api/search/multi?per_page=1&q={urllib.parse.quote(query.strip())}"
                r_genius = await client.get(genius_url)
                if r_genius.status_code == 200:
                    g_data = r_genius.json()
                    
                    if entity_type == 'artist':
                        for section in g_data.get('response', {}).get('sections', []):
                            if section.get('type') == 'artist':
                                hits = section.get('hits', [])
                                if hits:
                                    artist_result = hits[0].get('result', {})
                                    cover = cover or artist_result.get('image_url')
                                    if not title:
                                        raw_name = artist_result.get('name', '')
                                        title = re.sub(r'\s*\([^)]*\)$', '', raw_name).strip()
                                    break
                    elif entity_type == 'album':
                        for section in g_data.get('response', {}).get('sections', []):
                            if section.get('type') == 'album':
                                hits = section.get('hits', [])
                                if hits:
                                    album_result = hits[0].get('result', {})
                                    cover = cover or album_result.get('cover_art_url')
                                    if not title:
                                        artist_name = album_result.get('artist', {}).get('name', '')
                                        album_name = album_result.get('name', '')
                                        title = f"{artist_name} — {album_name}"
                                        title = re.sub(r'\s*\([^)]*\)$', '', title).strip()
                                    break
                    else:
                        for section in g_data.get('response', {}).get('sections', []):
                            if section.get('type') == 'song':
                                hits = section.get('hits', [])
                                if hits:
                                    song_result = hits[0].get('result', {})
                                    cover = cover or song_result.get('song_art_image_thumbnail_url') or song_result.get('header_image_url')
                                    if not title:
                                        artist_name = song_result.get('primary_artist', {}).get('name', '')
                                        song_title = song_result.get('title', '')
                                        title = f"{artist_name} — {song_title}"
                                    break

            except Exception as e:
                print(f"Genius API Error: {e}")

        # If STILL no cover, try Last.fm API
        if (not cover or not title) and entity_type in ['track', 'album']:
            import os
            lastfm_key = os.getenv("LASTFM_API_KEY")
            if lastfm_key:
                try:
                    # Try to extract artist and name
                    parts = re.split(r'\s*[-—]\s*', query.strip())
                    if len(parts) >= 2:
                        artist = parts[0]
                        item_name = parts[-1]
                        
                        if entity_type == 'album':
                            l_url = f"http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key={lastfm_key}&artist={urllib.parse.quote(artist)}&album={urllib.parse.quote(item_name)}&format=json"
                            r_l = await client.get(l_url)
                            if r_l.status_code == 200:
                                l_data = r_l.json().get('album', {})
                                images = l_data.get('image', [])
                                if images:
                                    extralarge = next((img['#text'] for img in images if img['size'] == 'extralarge' and img['#text']), None)
                                    if extralarge: cover = extralarge
                                if not title and l_data.get('name'):
                                    title = f"{l_data.get('artist')} — {l_data.get('name')}"
                                    ext_url = l_data.get('url')
                                    
                        elif entity_type == 'track':
                            l_url = f"http://ws.audioscrobbler.com/2.0/?method=track.getinfo&api_key={lastfm_key}&artist={urllib.parse.quote(artist)}&track={urllib.parse.quote(item_name)}&format=json"
                            r_l = await client.get(l_url)
                            if r_l.status_code == 200:
                                l_data = r_l.json().get('track', {})
                                album = l_data.get('album', {})
                                images = album.get('image', [])
                                if images:
                                    extralarge = next((img['#text'] for img in images if img['size'] == 'extralarge' and img['#text']), None)
                                    if extralarge: cover = extralarge
                                if not title and l_data.get('name'):
                                    title = f"{l_data.get('artist', {}).get('name')} — {l_data.get('name')}"
                                    ext_url = l_data.get('url')
                except Exception as e:
                    print(f"Last.fm API Error: {e}")

    return title, cover, ext_url
