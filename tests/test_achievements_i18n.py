"""English names and descriptions of achievements."""
import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.core.security import create_session_token
from app.models import Achievement, Notification, Scrobble, Track, User, UserIntegration, UserProfile
from app.services import achievements as ach


@pytest.fixture
def made(db):
    """Achievements created by a test; removed afterwards (the table is shared)."""
    created: list[int] = []
    yield created
    db.rollback()
    for ach_id in created:
        db.query(Achievement).filter(Achievement.id == ach_id).delete()
    db.commit()


def _user(db, name, lang="ru"):
    user = User(username=name, hashed_password="x", lang=lang)
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id))
    db.add(UserIntegration(user_id=user.id, bonus_xp=0))
    db.commit()
    db.refresh(user)
    return user


def _ach(db, made, **kw):
    a = Achievement(icon="🏆", **kw)
    db.add(a)
    db.commit()
    made.append(int(a.id))
    return a


def test_texts_pick_english_and_fall_back_to_russian(db, made):
    a = _ach(db, made, name="Меломан", description="Слушай много", name_en="Music lover",
             description_en="Listen a lot")
    assert ach.achievement_texts(a, "en") == {"name": "Music lover", "description": "Listen a lot"}
    assert ach.achievement_texts(a, "ru") == {"name": "Меломан", "description": "Слушай много"}
    plain = _ach(db, made, name="Только русский", description="Описание")
    assert ach.achievement_texts(plain, "en") == {"name": "Только русский", "description": "Описание"}
    assert ach.achievement_admin_texts(a) == {"name_en": "Music lover", "description_en": "Listen a lot"}


def test_artist_list_is_joined_in_english():
    target = json.dumps({"mode": "all", "artists": [
        {"name": "A", "url": "https://music.yandex.ru/artist/1", "track_count": 1},
        {"name": "B", "url": "", "track_count": 1},
        {"name": "C", "url": "", "track_count": 1},
    ]})
    a = Achievement(name="x", description="Прослушать {artists}",
                    description_en="Play every track by {artists}",
                    rule_type="specific_artist", rule_target=target)
    assert ach.render_achievement_description(a, "en") == (
        "Play every track by [A](https://music.yandex.ru/artist/1), B and C")
    assert ach.render_achievement_description(a) == (
        "Прослушать [A](https://music.yandex.ru/artist/1), B и C")


def test_listing_follows_request_language(client, db, made):
    user = _user(db, "listener")
    a = _ach(db, made, name="Ру-имя", description="Ру-описание", name_en="En name",
             description_en="En description")
    rows = client.get(f"/api/achievements/all/{user.username}", headers={"X-VEIN-Lang": "en"}).json()
    item = next(x for x in rows["achievements"] if x["id"] == a.id)
    assert (item["name"], item["description"]) == ("En name", "En description")
    rows = client.get(f"/api/achievements/all/{user.username}", headers={"X-VEIN-Lang": "ru"}).json()
    item = next(x for x in rows["achievements"] if x["id"] == a.id)
    assert (item["name"], item["description"]) == ("Ру-имя", "Ру-описание")


def test_unlock_notification_and_push_use_recipient_language(db, made):
    a = _ach(db, made, name="Первая тысяча-тест", description="", name_en="First thousand test",
             rule_type="total_scrobbles", rule_value=1, reward_xp=7)
    user = _user(db, "englishlistener", lang="en")
    track = Track(title="Song", artist="Band", duration=200)
    db.add(track)
    db.commit()
    db.add(Scrobble(user_id=user.id, track_id=track.id, listened_sec=200))
    db.commit()

    awarded = ach.award_achievements_for_user(int(user.id))
    summary = next(x for x in awarded if x["id"] == a.id)
    assert summary["name_en"] == "First thousand test"
    stored = [n.message for n in db.query(Notification).filter_by(user_id=user.id)]
    assert "🏆 First thousand test (+7 XP)" in stored

    with patch("app.services.webhooks.dispatch_webhook_event", new=AsyncMock()), \
            patch("app.services.push_notifications.notify_user_push", new=AsyncMock()) as push:
        asyncio.run(ach.notify_achievements_unlocked(int(user.id), [summary]))
    assert push.await_args.kwargs["title"] == "🏆 New achievement!"
    assert push.await_args.kwargs["body"] == "First thousand test (+7 XP)"


def test_admin_saves_english_texts(client, db, made):
    client.headers["Origin"] = "http://localhost:3000"
    client.post("/auth/register", json={"username": "achboss", "password": "password"})
    boss = db.query(User).filter(User.username == "achboss").one()
    boss.role = "admin"
    db.commit()
    client.cookies.clear()
    client.cookies.set("api_key", create_session_token(str(boss.id), str(boss.hashed_password)))

    body = {"name": "Админское", "description": "Описание", "icon": "🎧",
            "name_en": " Admin made ", "description_en": ""}
    assert client.post("/api/admin/achievements", json=body).status_code == 200
    db.expire_all()
    a = db.query(Achievement).filter_by(name="Админское").one()
    made.append(int(a.id))
    assert (a.name_en, a.description_en) == ("Admin made", None)

    # An older client that does not send the English fields keeps them
    body = {"name": "Админское", "description": "Описание", "icon": "🎧"}
    assert client.put(f"/api/admin/achievements/{a.id}", json=body).status_code == 200
    db.expire_all()
    assert db.get(Achievement, a.id).name_en == "Admin made"

    body["description_en"] = "Made by an admin"
    body["name_en"] = ""
    assert client.put(f"/api/admin/achievements/{a.id}", json=body).status_code == 200
    db.expire_all()
    a = db.get(Achievement, a.id)
    assert (a.name_en, a.description_en) == (None, "Made by an admin")
