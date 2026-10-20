from app.core.i18n import lang_from_accept, plural, request_lang, tr
from app.database import SessionLocal
from app.models import User


def test_accept_language_picks_russian_for_russian_speakers():
    assert lang_from_accept("ru-RU,ru;q=0.9,en;q=0.8") == "ru"
    assert lang_from_accept("uk") == "ru"
    assert lang_from_accept("en-GB,en;q=0.9") == "en"
    assert lang_from_accept("de-DE") == "en"
    assert lang_from_accept(None) is None
    assert lang_from_accept("*") is None


def test_tr_and_plural_fall_back_to_russian():
    assert tr("ru", "Привет, {name}", name="Pea") == "Привет, Pea"
    assert tr("en", "Нет такого ключа {x}", x=1) == "Нет такого ключа 1"
    assert plural("ru", 3, "трек", "трека", "треков") == "трека"
    assert plural("ru", 12, "трек", "трека", "треков") == "треков"


def test_request_lang_order():
    class Req:
        def __init__(self, headers):
            self.headers = headers

    class U:
        lang = "en"

    assert request_lang(Req({"X-VEIN-Lang": "ru"}), U()) == "ru"
    assert request_lang(Req({}), U()) == "en"
    assert request_lang(Req({"accept-language": "en-US"})) == "en"
    assert request_lang(Req({})) == "ru"


def test_register_saves_language_and_it_can_be_changed(client):
    client.headers["Origin"] = "http://localhost:3000"
    resp = client.post("/auth/register", json={"username": "englishman", "password": "password"},
                       headers={"X-VEIN-Lang": "en"})
    assert resp.status_code == 200
    db = SessionLocal()
    assert db.query(User).filter_by(username="englishman").one().lang == "en"
    db.close()
    assert client.put("/api/account/lang", json={"lang": "ru"}).json() == {"lang": "ru"}
    assert client.put("/api/account/lang", json={"lang": "de"}).status_code == 422
    db = SessionLocal()
    assert db.query(User).filter_by(username="englishman").one().lang == "ru"
    db.close()
