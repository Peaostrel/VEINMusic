"""Scrobble processing and achievement rules: the logic that decides what
counts, how much XP it earns and which achievements unlock."""
import asyncio
import time
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.models import (
    Achievement,
    BlacklistFilter,
    Scrobble,
    Track,
    TrackAlias,
    User,
    UserAchievement,
    UserIntegration,
    UserProfile,
)
from app.services import achievements as ach
from app.services import scrobble_processor as sp


def _user(db, name="u", **profile):
    user = User(username=name, hashed_password="x")
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id, **profile))
    db.add(UserIntegration(user_id=user.id, bonus_xp=0))
    db.commit()
    db.refresh(user)
    return user


def _track(db, title="Song", artist="Band", **kw):
    kw.setdefault("duration", 200)
    track = Track(title=title, artist=artist, **kw)
    db.add(track)
    db.commit()
    return track


def _listen(db, user, track, times=1, listened=None, played_at=None):
    for _ in range(times):
        db.add(Scrobble(user_id=user.id, track_id=track.id, source="yandex", is_playing=False,
                        listened_sec=track.duration if listened is None else listened,
                        played_at=played_at or datetime.now(UTC) - timedelta(days=2),
                        updated_at=played_at or datetime.now(UTC) - timedelta(days=2)))
    db.commit()


def _mock_http(module, handler):
    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)
    return patch.object(module.httpx, "AsyncClient", side_effect=factory)


# --- small helpers ---------------------------------------------------------------

@pytest.mark.parametrize("url,expected", [
    (None, ""), ("ftp://x/y", ""), ("javascript:alert(1)", ""), ("https://", ""),
    (" https://img.example/a.jpg ", "https://img.example/a.jpg"),
])
def test_safe_http_url(url, expected):
    assert sp._safe_http_url(url) == expected


def test_safe_track_url_allows_only_music_services():
    assert sp._safe_track_url("https://open.spotify.com/track/1") == "https://open.spotify.com/track/1"
    assert sp._safe_track_url("https://artist.soundcloud.com/x") == "https://artist.soundcloud.com/x"
    assert sp._safe_track_url("https://evil.example/track/1") == ""
    assert sp._safe_track_url("") == ""


@pytest.mark.parametrize("value,expected", [(None, 0), (10, 0), (200, 200), (3 * 3600, 0)])
def test_valid_duration(value, expected):
    assert sp._valid_duration(value) == expected


def test_track_duration_and_genre_lookups():
    def handler(request):
        url = str(request.url)
        if "track.jsx" in url:
            return httpx.Response(200, json={"track": {"durationMs": 245000, "albums": [{"genre": "rock"}]}})
        if "album.jsx" in url:
            return httpx.Response(200, json={"genre": "jazz"})
        return httpx.Response(404)

    with _mock_http(sp, handler):
        assert asyncio.run(sp.get_track_duration("https://music.yandex.ru/album/1/track/2?x=1")) == 245
        assert asyncio.run(sp.get_track_genre("https://music.yandex.ru/album/1/track/2")) == "rock"
        assert asyncio.run(sp.get_track_genre("https://music.yandex.ru/album/7")) == "jazz"
        assert asyncio.run(sp.get_track_genre("https://open.spotify.com/track/1")) is None
    assert asyncio.run(sp.get_track_duration("not a url")) == 180
    assert asyncio.run(sp.get_track_genre("")) is None

    def boom(request):
        raise httpx.ConnectError("down")
    with _mock_http(sp, boom):
        assert asyncio.run(sp.get_track_duration("https://music.yandex.ru/track/2")) == 180
        assert asyncio.run(sp.get_track_genre("https://music.yandex.ru/track/2")) is None


@pytest.mark.parametrize("age,expected", [
    (timedelta(seconds=10), "только что"), (timedelta(minutes=5), "5м назад"),
    (timedelta(hours=3), "3ч назад"),
])
def test_format_history_item_relative_time(db, age, expected):
    user = _user(db)
    track = _track(db)
    played = datetime.now(UTC) - age
    s = Scrobble(user_id=user.id, track_id=track.id, source="yandex", is_playing=True,
                 listened_sec=0, played_at=played, updated_at=played)
    db.add(s)
    db.commit()
    item = sp.format_history_item(s, track, db=db)
    assert item["relative_time"] == expected
    assert item["likes_count"] == 0
    assert item["is_playing"] is (age < timedelta(seconds=45))


def test_format_history_item_old_play_shows_date(db):
    user = _user(db)
    track = _track(db)
    played = datetime(2024, 3, 5, 12, 0)  # naive timestamps are treated as UTC
    s = Scrobble(user_id=user.id, track_id=track.id, source="yandex", is_playing=False,
                 listened_sec=200, played_at=played, updated_at=None)
    db.add(s)
    db.commit()
    assert sp.format_history_item(s, track)["relative_time"] == "05 Mar"


# --- catalog -----------------------------------------------------------------------

def test_existing_track_only_gets_missing_fields(db):
    track = _track(db, duration=sp.PLACEHOLDER_DURATION, track_url="https://music.yandex.ru/album/1")
    sp._update_existing_track(db, track, "https://img/c.jpg", "https://music.yandex.ru/album/1/track/5",
                              240, "Album")
    assert (track.cover_url, track.track_url, track.duration, track.album) == (
        "https://img/c.jpg", "https://music.yandex.ru/album/1/track/5", 240, "Album")

    sp._update_existing_track(db, track, "https://img/other.jpg", "https://music.yandex.ru/track/9", 300, "Other")
    # Nothing is overwritten once known (duration is shared by every listener)
    assert (track.cover_url, track.duration, track.album) == ("https://img/c.jpg", 240, "Album")


def test_find_or_create_track_follows_alias_and_normalises(db):
    canonical = _track(db, title="Song", artist="Band")
    db.add(TrackAlias(original_title="Song (Remastered 2011)", original_artist="Band",
                      canonical_track_id=canonical.id))
    db.commit()
    track, may_enrich = sp._find_or_create_track(db, "Song (Remastered 2011)", "Band", "", "", 0, "")
    assert (track.id, may_enrich) == (canonical.id, False)

    new, may_enrich = sp._find_or_create_track(
        db, "Brand New", "Someone", "javascript:x", "https://evil.example/t", 5, "")
    assert may_enrich is True
    assert (new.cover_url, new.track_url, new.duration) == ("", "", 0)
    again, _ = sp._find_or_create_track(db, "brand new", "SOMEONE", "", "", 0, "")
    assert again.id == new.id


def test_get_or_create_track_enriches_from_yandex(db):
    with patch.object(sp, "get_track_duration", new=AsyncMock(return_value=233)), \
            patch.object(sp, "get_track_genre", new=AsyncMock(return_value="pop")):
        track = asyncio.run(sp._get_or_create_track(
            db, "Enriched", "Artist", "", "https://music.yandex.ru/album/1/track/2", 0, ""))
    assert (track.duration, track.genre) == (233, "pop")


# --- counting rules ------------------------------------------------------------------

@pytest.mark.parametrize("profile,track_kw,expected", [
    ({"favorite_artist": "band"}, {}, True),
    ({"favorite_track": "song"}, {}, True),
    ({"favorite_album": "best of"}, {"album": "The Best Of"}, True),
    ({"favorite_album": "best of"}, {}, False),
    ({}, {}, False),
])
def test_check_favorite(db, profile, track_kw, expected):
    user = _user(db, **profile)
    assert sp._check_favorite(_track(db, **track_kw), user) is expected


def test_streak_grows_on_consecutive_days_and_resets(db):
    user = _user(db)
    track = _track(db)
    _listen(db, user, track, times=5, played_at=datetime.now(UTC))
    yesterday = (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%d")
    user.integration.last_streak_date = yesterday
    user.integration.current_streak = 4
    db.commit()
    sp._handle_streak(db, user)
    assert user.integration.current_streak == 5
    sp._handle_streak(db, user)  # same day: unchanged
    assert user.integration.current_streak == 5

    user.integration.last_streak_date = "2000-01-01"
    db.commit()
    sp._handle_streak(db, user)
    assert user.integration.current_streak == 1


def test_determine_is_new(db):
    user = _user(db)
    t1, t2 = _track(db, title="One"), _track(db, title="Two")
    now = datetime.now(UTC)

    assert sp._determine_is_new(db, t1, None, now, None, 0) == (True, None)

    playing = Scrobble(user_id=user.id, track_id=t1.id, source="yandex", is_playing=True,
                       listened_sec=100, played_at=now, updated_at=now)
    db.add(playing)
    db.commit()
    # Track switches faster than once a second are ignored
    assert sp._determine_is_new(db, t2, playing, now, now, 0) == (False, "ignored_spam_protection")
    # Same track restarted after most of it was heard: a new play (loop)
    playing.listened_sec = 190
    assert sp._determine_is_new(db, t1, playing, now, now - timedelta(seconds=5), 2) == (True, None)
    assert sp._determine_is_new(db, t1, playing, now, now - timedelta(seconds=5), 60) == (False, None)

    # A skipped track (a few seconds) is removed when the next one starts
    playing.listened_sec = 3
    db.commit()
    assert sp._determine_is_new(db, t2, playing, now, now - timedelta(seconds=10), 0) == (True, None)
    assert db.query(Scrobble).count() == 0


def test_progress_pause_only_touches_timestamp(db):
    user = _user(db)
    track = _track(db)
    start = datetime.now(UTC) - timedelta(seconds=20)
    s = Scrobble(user_id=user.id, track_id=track.id, source="yandex", is_playing=False,
                 listened_sec=10, played_at=start, updated_at=start)
    db.add(s)
    db.commit()
    now = datetime.now(UTC)
    assert sp._update_scrobble_progress(db, user, track, s, now, start, True) is False
    assert s.listened_sec == 10
    updated = s.updated_at if s.updated_at.tzinfo else s.updated_at.replace(tzinfo=UTC)
    assert updated == now  # SQLite returns naive datetimes


@pytest.mark.parametrize("kind,pattern,title,artist,album,expected", [
    ("keyword", "white noise", "10 Hours White Noise", "Sleep", "", True),
    ("keyword", "podcast", "Song", "Band", "My Podcast", True),
    ("artist", "band", "Song", "Band", "", True),
    ("artist", "ban", "Song", "Band", "", False),
    ("regex", r"^\d+ hours", "10 Hours Rain", "Nature", "", True),
    ("regex", "([", "Song", "Band", "", False),
    ("other", "x", "x", "x", "x", False),
])
def test_blacklist_filters(kind, pattern, title, artist, album, expected):
    f = BlacklistFilter(pattern=pattern, filter_type=kind)
    assert sp._matches_filter(f, title.lower(), artist.lower(), album.lower(), title, artist) is expected


def test_process_scrobble_end_to_end(db):
    user = _user(db, "e2e_listener")
    db.add(BlacklistFilter(pattern="rain sounds", filter_type="keyword", is_active=True))
    db.commit()
    with patch.object(sp.manager, "broadcast_to_user", new=AsyncMock()) as broadcast, \
            patch("app.core.redis.enqueue_background_task", new=AsyncMock()) as enqueue:
        blocked = asyncio.run(sp.process_scrobble(
            db, user, "Rain Sounds", "Nature", "", "", "yandex", 0, True, 200))
        assert blocked == "blacklisted"

        status = asyncio.run(sp.process_scrobble(
            db, user, "Counted", "Band", "", "", "yandex", 0, True, 100))
        assert status == "ok"
        broadcast.assert_awaited_once()
        assert broadcast.await_args.args[1]["type"] == "NEW_SCROBBLE"

        # Most of the track played since the last ping: the play counts
        s = db.query(Scrobble).one()
        s.listened_sec = 80
        s.updated_at = datetime.now(UTC) - timedelta(seconds=20)
        db.commit()
        asyncio.run(sp.process_scrobble(db, user, "Counted", "Band", "", "", "yandex", 100, True, 100))
    jobs = [c.args[0] for c in enqueue.await_args_list]
    assert jobs == ["async_dispatch_webhook", "async_export_scrobble"]
    export_args = enqueue.await_args_list[1].args
    assert export_args[2:4] == ("Band", "Counted")


# --- achievements ----------------------------------------------------------------------

def _achievement(db, **kw):
    kw.setdefault("name", f"ach-{kw.get('rule_type')}-{time.monotonic_ns()}")
    kw.setdefault("reward_xp", 10)
    a = Achievement(**kw)
    db.add(a)
    db.commit()
    return a


def _awarded_names(db, user):
    return {a.name for a in ach.check_auto_achievements(user, db)}


def test_specific_artist_and_track_rules(db):
    user = _user(db)
    _listen(db, user, _track(db, title="Kukla", artist="Korol i Shut"), times=3)
    artist = _achievement(db, name="artist", rule_type="specific_artist",
                          rule_target="Korol i Shut||https://music.yandex.ru/artist/1", rule_value=3)
    track_text = _achievement(db, name="track-text", rule_type="specific_track",
                              rule_target="Korol i Shut - Kukla", rule_value=2)
    one_word = _achievement(db, name="one-word", rule_type="specific_track", rule_target="Kukla", rule_value=3)
    too_many = _achievement(db, name="too-many", rule_type="specific_track", rule_target="Kukla", rule_value=50)
    names = _awarded_names(db, user)
    assert {"artist", "track-text", "one-word"} <= names
    assert "too-many" not in names
    assert user.integration.bonus_xp >= 30
    # Already earned achievements are not awarded twice
    assert not ({"artist", "track-text"} & _awarded_names(db, user))
    for a in (artist, track_text, one_word, too_many):
        assert ach._calculate_achievement_progress(db, user, a) == 3


def test_track_rules_by_url(db):
    user = _user(db)
    _listen(db, user, _track(db, title="T", artist="A", track_url="https://music.yandex.ru/album/9/track/77"))
    by_yandex_url = _achievement(db, name="yandex-url", rule_type="specific_track",
                                 rule_target="https://music.yandex.ru/album/9/track/77?utm=x", rule_value=1)
    by_meta = _achievement(db, name="meta", rule_type="specific_track",
                           rule_target="https://open.spotify.com/track/xyz", rule_meta="A — T", rule_value=1)
    by_other_url = _achievement(db, name="other-url", rule_type="specific_track",
                                rule_target="https://music.yandex.ru/album/9", rule_value=1)
    assert {"yandex-url", "meta", "other-url"} <= _awarded_names(db, user)
    assert ach._calculate_achievement_progress(db, user, by_yandex_url) == 1
    assert ach._calculate_achievement_progress(db, user, by_meta) == 1
    single_meta = Achievement(rule_type="specific_track", rule_target="https://x/track/1", rule_meta="T")
    assert ach._calculate_achievement_progress(db, user, single_meta) == 1
    assert ach._calculate_achievement_progress(db, user, by_other_url) == 0  # looks for /track/<url>


def test_album_rules(db):
    user = _user(db)
    cover = "https://avatars.yandex.net/get-music-content/cover/400x400"
    for i in range(2):
        _listen(db, user, _track(db, title=f"T{i}", artist="A", album="Alb", cover_url=cover,
                                 track_url=f"https://music.yandex.ru/album/5/track/{i}"))
    by_cover = _achievement(db, name="cover", rule_type="specific_album", rule_target="Alb",
                            target_image=cover, rule_value=2)
    _achievement(db, name="album-url", rule_type="specific_album",
                 rule_target="https://music.yandex.ru/album/5?x", rule_value=2)
    assert {"cover", "album-url"} <= _awarded_names(db, user)
    assert ach._calculate_achievement_progress(db, user, by_cover) == 2
    text = Achievement(rule_type="specific_album", rule_target="A - Alb")
    assert ach._calculate_achievement_progress(db, user, text) == 2
    meta = Achievement(rule_type="specific_album", rule_target="Alb||https://x", rule_meta=None)
    assert ach._calculate_achievement_progress(db, user, meta) == 2


def test_night_and_total_rules(db, monkeypatch):
    monkeypatch.setenv("TZ", "UTC")
    time.tzset()
    try:
        user = _user(db)  # no location: Moscow time (UTC+3)
        night_utc = datetime(2026, 1, 10, 22, 30, tzinfo=UTC)  # 01:30 in Moscow
        _listen(db, user, _track(db), times=2, played_at=night_utc)
        night = _achievement(db, name="night", rule_type="night_scrobbles", rule_value=2)
        total = _achievement(db, name="total", rule_type="total_scrobbles", rule_value=2)
        assert {"night", "total"} <= _awarded_names(db, user)
        assert ach._calculate_achievement_progress(db, user, total) == 2
        # progress uses the server's local time (UTC here): 22:30 is not night
        assert ach._calculate_achievement_progress(db, user, night) == 0
    finally:
        monkeypatch.delenv("TZ")
        time.tzset()


def test_rules_without_target_never_match(db):
    user = _user(db)
    for rule in ("specific_track", "specific_album", "specific_artist"):
        a = Achievement(rule_type=rule, rule_target=None, rule_value=1)
        assert getattr(ach, f"_check_{rule}")(user, a, db) is False
        assert ach._calculate_achievement_progress(db, user, a) == 0


def test_format_achievement_data(db):
    user = _user(db)
    _listen(db, user, _track(db), times=2)
    a = _achievement(db, name="fmt", rule_type="total_scrobbles", rule_value=5)
    data = ach._format_achievement_data(db, user, a, None, total_users=4)
    assert (data["is_earned"], data["current_progress"], data["rarity"]) == (False, 2, 0)
    ua = UserAchievement(user_id=user.id, achievement_id=a.id)
    db.add(ua)
    db.commit()
    data = ach._format_achievement_data(db, user, a, ua, total_users=4)
    assert (data["is_earned"], data["current_progress"], data["rarity"]) == (True, 5, 25.0)


def test_award_in_own_session_and_notifications(db):
    assert ach.award_achievements_for_user(999999) == []
    user = _user(db, "awardee")
    _listen(db, user, _track(db))
    awarded = ach.award_achievements_for_user(user.id)
    assert any(a["name"] == "Первые шаги" for a in awarded)

    with patch("app.services.webhooks.dispatch_webhook_event", new=AsyncMock()) as hook, \
            patch("app.services.push_notifications.notify_user_push", new=AsyncMock()) as push:
        asyncio.run(ach.notify_achievements_unlocked(user.id, []))
        hook.assert_not_awaited()
        asyncio.run(ach.notify_achievements_unlocked(user.id, [{"name": "X", "icon": None, "reward_xp": 5}]))
    assert hook.await_args.args[0] == "achievement.unlocked"
    assert push.await_args.kwargs["body"] == "X (+5 XP)"

    with patch("app.services.webhooks.dispatch_webhook_event", new=AsyncMock(side_effect=RuntimeError)):
        asyncio.run(ach.notify_achievements_unlocked(user.id, [{"name": "X"}]))  # logged, not raised

    with patch.object(ach, "award_achievements_for_user", return_value=[{"name": "Y"}]), \
            patch.object(ach, "notify_achievements_unlocked", new=AsyncMock()) as notify:
        ach.run_check_achievements_bg(user.id)
    notify.assert_awaited_once_with(user.id, [{"name": "Y"}])


def test_enrich_achievement_data():
    enrich = ach._enrich_achievement_data
    assert asyncio.run(enrich("total_scrobbles", "x", 5, "", "")) == ("x", 5, "", "")
    internal = "https://avatars.yandex.net/i.jpg"
    assert asyncio.run(enrich("specific_album", internal, 5, "", "")) == (internal, 5, internal, "")

    url = "https://music.yandex.ru/artist/1"
    with patch.object(ach, "parse_og_meta", new=AsyncMock(return_value=("Artist", "img"))):
        assert asyncio.run(enrich("specific_artist", url, 5, "", "")) == (f"Artist||{url}", 5, "img", "Artist")
        with patch.object(ach, "get_album_track_count", new=AsyncMock(return_value=12)):
            assert asyncio.run(enrich("specific_album", url, 5, "", "")) == (url, 12, "img", "")


def test_album_track_count():
    def handler(request):
        if request.url.host == "music.yandex.ru":
            return httpx.Response(200, json={"trackCount": 14})
        return httpx.Response(200, text='<meta name="music:song_count" content="9">')

    with patch("app.utils.is_safe_url", return_value=True), _mock_http(ach, handler):
        assert asyncio.run(ach.get_album_track_count("https://music.yandex.ru/album/42")) == 14
        assert asyncio.run(ach.get_album_track_count("https://open.spotify.com/album/abc")) == 9
        assert asyncio.run(ach.get_album_track_count("https://open.spotify.com/track/abc")) == 0
    with patch("app.utils.is_safe_url", return_value=False):
        assert asyncio.run(ach.get_album_track_count("https://127.0.0.1/album/1")) == 0

    def boom(request):
        raise httpx.ConnectError("down")
    with patch("app.utils.is_safe_url", return_value=True), _mock_http(ach, boom):
        assert asyncio.run(ach.get_album_track_count("https://music.yandex.ru/album/42")) == 0


def test_no_auto_achievements(db):
    db.query(Achievement).update({"rule_type": "manual"})
    db.commit()
    try:
        assert ach.check_auto_achievements(_user(db), db) == []
    finally:
        db.rollback()
        # restore the seeded rules for the other tests
        for name, rule in (("Первые шаги", "total_scrobbles"), ("Ночная сова", "night_scrobbles"),
                           ("Король рока", "specific_artist")):
            db.query(Achievement).filter_by(name=name).update({"rule_type": rule})
        db.commit()
