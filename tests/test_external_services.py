"""metadata_search (iTunes / Genius / Last.fm / MusicBrainz) and
external_sync (Last.fm / Libre.fm / ListenBrainz export), with HTTP mocked."""
import asyncio
import json
import urllib.parse
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.models import ExternalSyncConfig, User
from app.services import external_sync, metadata_search as ms


def _mock_http(module, handler):
    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)
    return patch.object(module.httpx, "AsyncClient", side_effect=factory)


def _router(routes):
    """Handler answering by (host, path substring) -> JSON (or a Response)."""
    def handler(request):
        url = str(request.url)
        for (host, needle), answer in routes.items():
            if request.url.host == host and needle in url:
                return answer if isinstance(answer, httpx.Response) else httpx.Response(200, json=answer)
        return httpx.Response(404)
    return handler


ITUNES_SONG = {"resultCount": 1, "results": [{
    "artistName": "Band", "trackName": "Song", "trackViewUrl": "https://music.apple.com/t",
    "artworkUrl100": "https://img/100x100bb.jpg"}]}


# --- search_metadata ---------------------------------------------------------

def test_search_metadata_uses_itunes():
    with _mock_http(ms, _router({("itunes.apple.com", "entity=song"): ITUNES_SONG})):
        assert asyncio.run(ms.search_metadata("band song", "track")) == (
            "Band — Song", "https://img/600x600bb.jpg", "https://music.apple.com/t")


@pytest.mark.parametrize("entity,item,expected", [
    ("album", {"artistName": "A", "collectionName": "Alb", "collectionViewUrl": "u", "artworkUrl100": ""},
     ("A — Alb", None, "u")),
    ("artist", {"artistName": "A", "artistLinkUrl": "u"}, ("A", None, "u")),
])
def test_search_itunes_entities(entity, item, expected):
    itunes_entity = {"album": "album", "artist": "musicArtist"}[entity]
    routes = {("itunes.apple.com", f"entity={itunes_entity}"): {"resultCount": 1, "results": [item]}}

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(_router(routes))) as client:
            return await ms._search_itunes(client, "q", itunes_entity)
    title, cover, url = asyncio.run(run())
    actual = (title, cover or None, url)
    assert actual == expected


@pytest.mark.parametrize("entity,section,result,expected", [
    ("artist", "artist", {"name": "Singer (RU)", "image_url": "img"}, ("Singer", "img")),
    ("album", "album", {"name": "Alb", "artist": {"name": "A"}, "cover_art_url": "c"}, ("A — Alb", "c")),
    ("track", "song", {"title": "T", "primary_artist": {"name": "A"}, "header_image_url": "h"}, ("A — T", "h")),
])
def test_search_metadata_falls_back_to_genius(entity, section, result, expected):
    routes = {
        ("itunes.apple.com", "search"): {"resultCount": 0, "results": []},
        ("genius.com", "search/multi"): {"response": {"sections": [
            {"type": "other", "hits": []},
            {"type": section, "hits": [{"result": result}]},
        ]}},
    }
    with _mock_http(ms, _router(routes)):
        title, cover, _ = asyncio.run(ms.search_metadata("query", entity))
    actual = (title, cover)
    assert actual == expected


@pytest.mark.parametrize("entity,payload,expected", [
    ("album", {"album": {"name": "Alb", "artist": "A", "url": "lf",
                         "image": [{"size": "small", "#text": "s"}, {"size": "extralarge", "#text": "xl"}]}},
     ("A — Alb", "xl", "lf")),
    ("track", {"track": {"name": "T", "artist": {"name": "A"}, "url": "lf",
                         "album": {"image": [{"size": "extralarge", "#text": "xl"}]}}},
     ("A — T", "xl", "lf")),
])
def test_search_metadata_falls_back_to_lastfm(monkeypatch, entity, payload, expected):
    monkeypatch.setenv("LASTFM_API_KEY", "k")
    routes = {
        ("itunes.apple.com", "search"): httpx.Response(500),
        ("genius.com", "search"): httpx.Response(500),
        ("ws.audioscrobbler.com", f"method={entity}.getinfo"): payload,
    }
    with _mock_http(ms, _router(routes)):
        assert asyncio.run(ms.search_metadata("A - Name", entity)) == expected


def test_search_metadata_edge_cases(monkeypatch):
    assert asyncio.run(ms.search_metadata("   ", "track")) == (None, None, None)
    monkeypatch.setenv("LASTFM_API_KEY", "k")

    def boom(request):
        raise httpx.ConnectError("down")
    with _mock_http(ms, boom):
        # every provider failing is not an error, just no result
        assert asyncio.run(ms.search_metadata("A - B", "track")) == (None, None, None)

    async def lastfm_without_dash():
        async with httpx.AsyncClient(transport=httpx.MockTransport(boom)) as client:
            return await ms._search_lastfm(client, "no dash", "track", None, None, "k")
    assert asyncio.run(lastfm_without_dash()) == (None, None, None)


# --- search_suggestions -------------------------------------------------------

def test_suggestions_empty_query():
    assert asyncio.run(ms.search_suggestions(" ", "artist")) == []


def test_artist_suggestions_from_genius_lastfm_and_itunes(monkeypatch):
    monkeypatch.setenv("GENIUS_ACCESS_TOKEN", "g")
    monkeypatch.setenv("LASTFM_API_KEY", "k")
    routes = {
        ("api.genius.com", "search"): {"response": {"hits": [
            {"type": "song", "result": {"primary_artist": {"name": "Alpha (RU)", "image_url": "ga"}}},
            {"type": "song", "result": {"primary_artist": {"name": "alpha", "image_url": "dup"}}},
            {"type": "video", "result": {}},
        ]}},
        ("ws.audioscrobbler.com", "artist.search"): {"results": {"artistmatches": {"artist": [
            {"name": "Beta feat. Gamma", "image": [{"#text": ""}]},
            {"name": None},
        ]}}},
        ("itunes.apple.com", "musicArtist"): {"results": [{"artworkUrl100": "it"}]},
    }
    with _mock_http(ms, _router(routes)):
        results = asyncio.run(ms.search_suggestions("alp", "artist"))
    assert results[:2] == [{"title": "Alpha", "image": "ga"}, {"title": "Beta", "image": "it"}]


def test_track_suggestions(monkeypatch):
    monkeypatch.setenv("GENIUS_ACCESS_TOKEN", "g")
    monkeypatch.setenv("LASTFM_API_KEY", "k")
    routes = {
        ("api.genius.com", "search"): {"response": {"hits": [
            {"type": "song", "result": {"title": "Song (Live)", "primary_artist": {"name": "A"},
                                        "song_art_image_thumbnail_url": "gi"}},
        ]}},
        ("ws.audioscrobbler.com", "track.search"): {"results": {"trackmatches": {"track": [
            {"name": "Song", "artist": "A", "image": []},
            {"name": "Other (Remix)", "artist": "B",
             "image": [{"#text": "https://x/2a96cbd8b46e442fc41c2b86b821562f.png"}, {"#text": "real"}]},
        ]}}},
        ("itunes.apple.com", "entity=song"): {"results": [
            {"artistName": "C", "trackName": "Tune (Edit)", "artworkUrl60": "i60"},
            {"artistName": ""},
        ]},
    }
    with _mock_http(ms, _router(routes)):
        results = asyncio.run(ms.search_suggestions("song", "track"))
    assert results == [
        {"title": "A — Song", "image": "gi"},
        {"title": "B — Other", "image": "real"},
        {"title": "C — Tune", "image": "i60"},
    ]


def test_album_suggestions_lastfm_and_itunes(monkeypatch):
    monkeypatch.delenv("GENIUS_ACCESS_TOKEN", raising=False)
    monkeypatch.setenv("LASTFM_API_KEY", "k")
    routes = {
        ("ws.audioscrobbler.com", "album.search"): {"results": {"albummatches": {"album": [
            {"name": "Alb (Deluxe)", "artist": "A", "image": [{"#text": "lf"}]},
        ]}}},
        ("itunes.apple.com", "entity=album"): {"results": [
            {"artistName": "A", "collectionName": "Alb", "artworkUrl100": "dup"},
            {"artistName": "B", "collectionName": "Second", "artworkUrl100": "it"},
        ]},
    }
    with _mock_http(ms, _router(routes)):
        results = asyncio.run(ms.search_suggestions("alb", "album"))
    assert results == [{"title": "A — Alb", "image": "lf"}, {"title": "B — Second", "image": "it"}]


def test_suggestions_survive_provider_errors(monkeypatch):
    monkeypatch.setenv("GENIUS_ACCESS_TOKEN", "g")
    monkeypatch.setenv("LASTFM_API_KEY", "k")
    routes = {
        ("api.genius.com", "search"): httpx.Response(200, text="not json"),
        ("ws.audioscrobbler.com", "search"): httpx.Response(200, text="not json"),
        ("itunes.apple.com", "search"): httpx.Response(200, text="not json"),
    }
    with _mock_http(ms, _router(routes)):
        assert asyncio.run(ms.search_suggestions("x", "album")) == []


# --- MusicBrainz ---------------------------------------------------------------

def test_musicbrainz_metadata():
    seen = {}

    def handler(request):
        seen["query"] = urllib.parse.unquote(str(request.url))
        seen["ua"] = request.headers["User-Agent"]
        return httpx.Response(200, json={"recordings": [{
            "id": "mbid-1", "title": "Song", "isrcs": ["ISRC1"], "releases": [{"title": "Alb"}]}]})

    with _mock_http(ms, handler):
        assert asyncio.run(ms.search_musicbrainz_metadata("Band", "Song")) == {
            "mbid": "mbid-1", "isrc": "ISRC1", "canonical_title": "Song", "release_title": "Alb"}
    assert 'artist:"Band"' in seen["query"]
    assert seen["ua"].startswith("VEINMusic/")

    empty = {"mbid": None, "isrc": None, "canonical_title": None, "release_title": None}
    with _mock_http(ms, lambda r: httpx.Response(200, json={"recordings": []})):
        assert asyncio.run(ms.search_musicbrainz_metadata("B", "S")) == empty
    with _mock_http(ms, lambda r: httpx.Response(503)):
        assert asyncio.run(ms.search_musicbrainz_metadata("B", "S")) == empty


# --- external_sync ---------------------------------------------------------------

def test_lastfm_signature_is_md5_of_sorted_params():
    import hashlib
    sig = external_sync._generate_lastfm_signature({"b": "2", "a": "1"}, "secret")
    assert sig == hashlib.md5(b"a1b2secret", usedforsecurity=False).hexdigest()


def test_export_to_lastfm_signs_and_checks_acceptance():
    seen = {}

    def handler(request):
        seen.update(urllib.parse.parse_qsl(request.content.decode()))
        return httpx.Response(200, json={"scrobbles": {"@attr": {"accepted": 1}}})

    with _mock_http(external_sync, handler):
        ok = asyncio.run(external_sync.export_to_lastfm(
            "sk", "A", "T", album="Alb", timestamp=100, api_key="key", api_sig_key="secret"))
    assert ok is True
    assert seen["method"] == "track.scrobble"
    assert seen["album"] == "Alb"
    assert seen["timestamp"] == "100"
    expected = {k: v for k, v in seen.items() if k not in ("api_sig", "format")}
    assert seen["api_sig"] == external_sync._generate_lastfm_signature(expected, "secret")

    rejected = {"scrobbles": {"@attr": {"accepted": 0}}}
    with _mock_http(external_sync, lambda r: httpx.Response(200, json=rejected)):
        assert asyncio.run(external_sync.export_to_lastfm("sk", "A", "T", api_key="k", api_sig_key="s")) is False
    assert asyncio.run(external_sync.export_to_lastfm("", "A", "T", api_key="k", api_sig_key="s")) is False


def test_export_to_librefm_and_listenbrainz():
    seen = {}

    def handler(request):
        if request.url.host == "api.listenbrainz.org":
            seen["lb_auth"] = request.headers["Authorization"]
            seen["lb_body"] = json.loads(request.content)
        else:
            seen["librefm"] = dict(urllib.parse.parse_qsl(request.content.decode()))
        return httpx.Response(200, json={})

    with _mock_http(external_sync, handler):
        assert asyncio.run(external_sync.export_to_librefm("sk", "A", "T", "Alb", 5)) is True
        assert asyncio.run(external_sync.export_to_listenbrainz("tok", "A", "T", None, 5)) is True
    assert seen["librefm"]["album"] == "Alb"
    assert seen["lb_auth"] == "Token tok"
    listen = seen["lb_body"]["payload"][0]
    assert listen == {"listened_at": 5, "track_metadata": {
        "artist_name": "A", "track_name": "T", "release_name": ""}}

    assert asyncio.run(external_sync.export_to_librefm("", "A", "T")) is False
    assert asyncio.run(external_sync.export_to_listenbrainz("", "A", "T")) is False

    def boom(request):
        raise httpx.ConnectError("down")
    with _mock_http(external_sync, boom):
        assert asyncio.run(external_sync.export_to_librefm("sk", "A", "T")) is False
        assert asyncio.run(external_sync.export_to_listenbrainz("tok", "A", "T")) is False
        assert asyncio.run(external_sync.export_to_lastfm("sk", "A", "T", api_key="k", api_sig_key="s")) is False


def test_dispatch_external_exports_only_to_enabled_services(db):
    user = User(username="exporter", hashed_password="x")
    db.add(user)
    db.flush()
    db.add(ExternalSyncConfig(
        user_id=user.id, lastfm_session_key="sk", is_lastfm_enabled=True,
        listenbrainz_token="tok", is_listenbrainz_enabled=False,
        librefm_session_key="lsk", is_librefm_enabled=True))
    db.commit()
    with patch.object(external_sync, "export_to_lastfm", new=AsyncMock()) as lastfm, \
            patch.object(external_sync, "export_to_listenbrainz", new=AsyncMock()) as lb, \
            patch.object(external_sync, "export_to_librefm", new=AsyncMock()) as librefm:
        asyncio.run(external_sync.dispatch_external_exports(user.id, "A", "T", None, 7, db))
        asyncio.run(external_sync.dispatch_external_exports(999999, "A", "T", None, 7, db))
    lastfm.assert_awaited_once_with("sk", "A", "T", None, 7)
    lb.assert_not_awaited()
    librefm.assert_awaited_once_with("lsk", "A", "T", None, 7)
