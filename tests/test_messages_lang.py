"""Texts sent to people who aren't looking are in the recipient's language."""
import json
from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

from app.models import EmailAccount, EmailOutbox, Notification, Report, Scrobble, Track, User, UserProfile
from app.services import email_delivery as mail
from app.services import notifications
from app.services.music_story import story_text
from app.services.sessions import issue_session, localized_device


def _user(db, name, lang):
    user = User(username=name, hashed_password="fixture-hash", lang=lang, profile=UserProfile())
    db.add(user)
    db.commit()
    return user


def test_social_texts_follow_the_recipient_language(client, db):
    alice = _user(db, "alice_en", "en")
    bob = _user(db, "bob_ru", "ru")
    track = Track(title="Song", artist="Artist", duration=200)
    db.add(track)
    db.flush()
    scrobble = Scrobble(user_id=alice.id, track_id=track.id, source="yandex", is_playing=False)
    db.add(scrobble)
    db.commit()
    like = notifications.create(db, recipient_id=alice.id, actor_id=bob.id, kind="like", scrobble_id=scrobble.id)
    comment = notifications.create(db, recipient_id=alice.id, actor_id=bob.id, kind="comment",
                                   scrobble_id=scrobble.id, message="nice")
    follow = notifications.create(db, recipient_id=bob.id, actor_id=alice.id, kind="follow")
    db.commit()

    assert notifications._push_payload(like.id)[2] == "bob_ru liked “Song”"
    assert notifications._push_payload(comment.id)[2] == "bob_ru commented on “Song”: nice"
    # The Russian recipient gets Russian even from an English-speaking actor
    assert notifications._push_payload(follow.id)[2] == "alice_en подписался(ась) на вас"
    texts = {i["kind"]: i["text"] for i in notifications.list_for_user(db, alice.id)["items"]}
    assert texts["like"] == "bob_ru liked “Song”"
    assert notifications.list_for_user(db, alice.id, lang="ru")["items"][0]["text"].startswith("bob_ru")
    assert notifications.describe("en", "like", "x", None) == "x liked your play"


def test_message_kind_push_body_is_the_message(db):
    user = _user(db, "solo_en", "en")
    note = notifications.create(db, recipient_id=user.id, actor_id=user.id, kind="security", message="Hello")
    db.commit()
    assert notifications._push_payload(note.id)[2] == "Hello"


def test_achievement_helpers():
    assert notifications.achievement_message(None, "First play", 10) == "🏆 First play (+10 XP)"
    assert notifications.achievement_push("en", "🎧", "First play", 10) == ("🎧 New achievement!", "First play (+10 XP)")
    assert notifications.achievement_push("ru", None, "Первое", 5)[0] == "🏆 Новое достижение!"


def test_new_sign_in_notice_and_email_in_english(db, monkeypatch):
    monkeypatch.setenv("BREVO_API_KEY", "test-key")
    monkeypatch.setenv("EMAIL_FROM", "notifications@example.com")
    user = _user(db, "traveller", "en")
    db.add(EmailAccount(user_id=user.id, email="t@example.com", security_alerts=True))
    db.commit()
    issue_session(db, user, Mock(cookies={}, headers={"user-agent": "curl/8"}))
    note = db.query(Notification).filter_by(user_id=user.id, kind="security").one()
    assert note.message.startswith("Sign-in from a new device: Browser · Unknown device.")
    payload = json.loads(db.query(EmailOutbox).filter_by(user_id=user.id, kind="security").one().payload)
    assert payload["subject"] == "New sign-in to VEIN Music"
    assert "from a new device: Browser · Unknown device." in payload["text"]
    assert payload["lang"] == "en"
    html = mail.render(payload)
    assert '<html lang="en">' in html and "Open VEIN Music" in html
    # Old outbox rows have no language: Russian
    assert "Открыть VEIN Music" in mail.render({"text": "x", "link": "https://a"})


def test_russian_wording_is_unchanged(db):
    assert localized_device("Браузер · Linux", "ru") == "Браузер · Linux"
    assert story_text("ru", 3, 9, "A", "B", 2, 7) == (
        "За неделю — 3 прослушиваний и 9 минут музыки. Чаще всего звучал A. "
        "Главное открытие — B. Новых исполнителей: 2. Самый музыкальный час — 07:00.")
    assert story_text("en", 1, 9, "A", None, 0, None) == "This week: 1 play and 9 minutes of music. Most played: A."
    assert mail.time_text("en", datetime(2026, 10, 5, 9, 3)) == "Oct 5, 2026 09:03"


def test_recap_and_story_in_english(db):
    from app.services.recap_notifications import create_due_recap_notifications
    from app.services.user_preferences import get_preferences, save_preferences
    user = _user(db, "weekly_en", "en")
    preferences = get_preferences(user.profile)
    preferences.wrapped.auto_weekly = True
    preferences.notifications.in_app.weekly_digest = True
    save_preferences(user.profile, preferences)
    db.commit()
    now = datetime(2026, 10, 5, 6, tzinfo=UTC)
    ids = create_due_recap_notifications(now)
    db.expire_all()
    message = db.get(Notification, ids[0]).message
    assert message.startswith("Your weekly recap for Oct 5, 2026 is ready. This week: 0 plays")
    assert create_due_recap_notifications(now + timedelta(minutes=1)) == []


def test_moderators_get_reports_in_their_language(db):
    from app.routers.reports import _alert_moderators
    reporter = _user(db, "reporter", "ru")
    admin_en = _user(db, "mod_en", "en")
    admin_ru = _user(db, "mod_ru", "ru")
    for admin in (admin_en, admin_ru):
        admin.role = "admin"
    report = Report(reporter_id=reporter.id, target_type="user", target_user_id=reporter.id, reason="spam",
                    status="open", target_snapshot="{}")
    db.add(report)
    db.flush()
    _alert_moderators(db, report)
    db.commit()
    texts = {n.user_id: n.message for n in db.query(Notification).filter_by(kind="moderation")}
    assert texts[admin_en.id] == "New report: profile @reporter, spam or advertising"
    assert texts[admin_ru.id] == "Новая жалоба: профиль @reporter, спам или реклама"


def test_import_finished_text():
    from app.services.lastfm_import import import_finished_text
    assert import_finished_text("en", 1) == "✅ Import finished! Added 1 track."
    assert import_finished_text("ru", 5) == "✅ Импорт завершен! Добавлено 5 треков."
