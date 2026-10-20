"""Texts the API builds into responses follow the visitor's language."""
from datetime import UTC, date, datetime, timedelta

from app.core.security import create_session_token
from app.models import Scrobble, Track, User
from app.routers.platform import _localized_room
from app.services.compatibility import calculate_compatibility
from app.services.listen_status import listen_status
from app.services.localized import date_range, relative_time, source_label
from app.services.recommendations import _apply_feedback_weights, _apply_recent_interests

EN = {"X-VEIN-Lang": "en"}
ORIGIN = {"Origin": "http://localhost:3000"}


def _register(client, username, lang="ru"):
    client.headers.update(ORIGIN)
    assert client.post("/auth/register", json={"username": username, "password": "password"},
                       headers={"X-VEIN-Lang": lang}).status_code == 200


def _play(db, username, title="Song", artist="Band", minutes_ago=5):
    user = db.query(User).filter_by(username=username).one()
    track = Track(title=title, artist=artist, duration=100)
    db.add(track)
    db.commit()
    when = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    db.add(Scrobble(user_id=user.id, track_id=track.id, listened_sec=100, source="test",
                    played_at=when, updated_at=when, is_playing=False))
    db.commit()


def test_relative_times_and_dates_in_both_languages():
    now = datetime(2026, 5, 20, 12, 0, tzinfo=UTC)
    assert relative_time(now - timedelta(seconds=10), "en", now) == "just now"
    assert relative_time(now - timedelta(minutes=5), "en", now) == "5m ago"
    assert relative_time(now - timedelta(hours=3), "en", now) == "3h ago"
    assert relative_time(datetime(2026, 5, 12, tzinfo=UTC), "en", now) == "May 12"
    assert relative_time(now - timedelta(minutes=5), "ru", now) == "5м назад"
    assert relative_time(datetime(2026, 5, 12, tzinfo=UTC), "ru", now) == "12 мая"
    assert date_range(date(2026, 5, 1), date(2026, 5, 12), "en") == "May 1, 2026 – May 12, 2026"
    assert date_range(date(2026, 5, 1), date(2026, 5, 12), "ru") == "01.05.2026 — 12.05.2026"
    assert source_label("yandex · облако", "en") == "yandex · cloud"
    assert source_label("yandex · облако", "ru") == "yandex · облако"


def test_wrapped_and_detailed_stats_labels_follow_the_header(client, db):
    _register(client, "periodfan")
    _play(db, "periodfan")
    year = datetime.now(UTC).year
    ru = client.get("/api/stats/wrapped", params={"username": "periodfan", "period": "year"}).json()
    assert ru["period"] == f"С начала {year} года"
    en = client.get("/api/stats/wrapped", params={"username": "periodfan", "period": "year"}, headers=EN).json()
    assert en["period"] == f"Since the start of {year}"
    assert en["status"] == "Active listener"
    custom = client.get("/api/stats/wrapped", headers=EN, params={
        "username": "periodfan", "period": "custom", "date_from": "2026-01-01", "date_to": "2026-01-31"}).json()
    assert custom["period"] == "Jan 1, 2026 – Jan 31, 2026"
    bad = client.get("/api/stats/wrapped", params={"username": "periodfan", "period": "decade"}, headers=EN)
    assert bad.status_code == 422 and bad.json()["detail"] == "Unknown period"

    # Cached per language
    ru_detail = client.get("/api/detailed-stats/periodfan").json()
    en_detail = client.get("/api/detailed-stats/periodfan", headers=EN).json()
    assert "Пн" in ru_detail["days_activity"]
    assert list(en_detail["days_activity"]) == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def test_history_relative_time_and_rank_in_english(client, db):
    _register(client, "historyfan", lang="en")
    _play(db, "historyfan", minutes_ago=5)
    item = client.get("/api/history/historyfan", headers=EN).json()["history"][0]
    assert item["relative_time"] == "5m ago"
    item = client.get("/api/history/historyfan", headers={"X-VEIN-Lang": "ru"}).json()["history"][0]
    assert item["relative_time"] == "5м назад"
    assert client.get("/api/user/historyfan", headers=EN).json()["rank"] == "Tourist"
    assert client.get("/api/user/mood", params={"username": "historyfan"}, headers=EN).json()["mood"]


def test_listen_status_compatibility_and_recommendation_reasons():
    class Listen:
        listened_sec, excluded_from_stats, is_imported, is_playing = 100, False, False, False
        updated_at = played_at = datetime.now(UTC)

    class T:
        duration = 100

    status = listen_status(Listen(), T(), "en")
    assert status["label"] == "Counted" and status["explanation"].startswith("To count")
    assert listen_status(Listen(), T())["label"] == "Засчитано"

    assert calculate_compatibility(1, 1, None, "en")["summary"] == "You listen to exactly the same music!"

    items = [{"artist": "Muse", "genre": "rock", "reason_type": "genre_similarity", "confidence_score": 0.5},
             {"artist": "Bjork", "genre": "pop", "reason_type": "genre_similarity", "confidence_score": 0.5}]
    _apply_feedback_weights(items, set(), {"Muse"}, "en")
    _apply_recent_interests(items, {}, ["pop"], 50, "en")
    assert items[0]["reason"] == "Based on your pick: Muse"
    assert items[1]["reason"] == "In pop, a genre you've played in the last 30 days"


def test_dynamic_errors_in_english(client, db, monkeypatch):
    from app.core import login_guard
    monkeypatch.setattr(login_guard, "seconds_until_unlocked", lambda *a, **k: 300)
    client.headers.update(ORIGIN)
    locked = client.post("/auth/login", json={"username": "x", "password": "y"}, headers=EN)
    assert locked.status_code == 429
    assert locked.json()["detail"] == "Too many failed sign-in attempts. Try again in 5 min."
    monkeypatch.undo()

    _register(client, "keymaker", lang="en")
    bad = client.post("/api/developer/keys", json={"scopes": "nope"})
    assert bad.status_code == 400 and bad.json()["detail"].startswith("Invalid scopes: nope. Available:")


def test_broadcast_unknown_channels_in_admin_language(client, db):
    _register(client, "boss")
    boss = db.query(User).filter_by(username="boss").one()
    boss.role = "admin"
    db.commit()
    client.cookies.clear()
    client.cookies.set("api_key", create_session_token(str(boss.id), str(boss.hashed_password)))
    resp = client.post("/api/admin/broadcast", json={"message": "x", "channels": ["sms"]}, headers=EN)
    assert resp.status_code == 422 and resp.json()["detail"] == "Unknown channels: sms"


def test_countries_in_english_keep_russian_name(client):
    ru = client.get("/api/geo/countries").json()
    assert {"name": "США", "code": "US", "flag": "🇺🇸"} in ru
    en = client.get("/api/geo/countries", headers={"Accept-Language": "en-US"})
    assert "Accept-Language" in en.headers["vary"]
    countries = en.json()
    assert {"name": "United States", "code": "US", "flag": "🇺🇸", "name_ru": "США"} in countries
    assert {"name": "Russia", "code": "RU", "flag": "🇷🇺", "name_ru": "Россия"} in countries
    assert countries[0]["name"] == "Afghanistan"
    assert len(countries) == len(ru)


def test_share_cards_and_widgets_language(client, db):
    _register(client, "cardfan")
    _play(db, "cardfan")
    ru = client.get("/api/widgets/og/recap/cardfan.svg").text
    assert "ИТОГИ НЕДЕЛИ" in ru and "СКРОББЛОВ" in ru
    en = client.get("/api/widgets/og/recap/cardfan.svg", headers={"Accept-Language": "en"}).text
    assert "WEEKLY RECAP" in en and "SCROBBLES" in en and "СКРОББЛОВ" not in en
    assert "MONTHLY RECAP" in client.get("/api/widgets/og/recap/cardfan.svg?period=month&lang=en").text
    # Embeds follow the owner's language unless ?lang= says otherwise
    assert "НЕДАВНО НА VEIN" in client.get("/api/widgets/now-playing/cardfan.svg").text
    assert "ТОП ИСПОЛНИТЕЛЕЙ" in client.get("/api/widgets/top-artists/cardfan.svg").text
    assert "LAST PLAYED ON VEIN" in client.get("/api/widgets/now-playing/cardfan.svg?lang=en").text
    db.query(User).filter(User.username == "cardfan").update({"lang": "en"})
    db.commit()
    assert "LAST PLAYED ON VEIN" in client.get("/api/widgets/now-playing/cardfan.svg").text


def test_default_room_texts_are_translated():
    room = {"room_id": "abc", "name": "Комната abc",
            "current_track": {"title": "Ожидание трека от DJ...", "artist": "host"}}
    en = _localized_room(room, "en")
    assert en["name"] == "Room abc" and en["current_track"]["title"] == "Waiting for a track from the DJ..."
    assert _localized_room({**room, "name": "Party"}, "en")["name"] == "Party"
    assert _localized_room(room, "ru") is room
