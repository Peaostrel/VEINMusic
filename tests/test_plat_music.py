"""Partner sends authenticated playback to the shared scrobble API."""
import json
import secrets
from datetime import UTC, datetime, timedelta

import pytest

from app.core.security import create_session_token, hash_developer_key
from app.models import ApiKey, Scrobble, SourceHealth, User, UserIntegration, UserProfile


@pytest.fixture
def plat_account(db):
    user = User(username="plat_listener", hashed_password="fixture-hash",
                profile=UserProfile(preferences=json.dumps({"listening": {"auto_metadata": False}})),
                integration=UserIntegration())
    db.add(user)
    db.flush()
    token = "vm_" + secrets.token_urlsafe(32)
    key = ApiKey(user_id=user.id, key_hash=hash_developer_key(token), prefix=token[:9],
                 name="Устройство: Plat Music", scopes="scrobble:write,profile:read", is_active=True)
    db.add(key)
    db.commit()
    owner = {"X-API-Key": create_session_token(str(user.id), str(user.hashed_password))}
    return user, key, token, owner


def payload(source="plat_music", progress=0, playing=True):
    return {"title": "Partner Track", "artist": "Partner Artist", "album": "Partner Album",
            "source": source, "duration": 180, "progress_sec": progress, "is_playing": playing,
            "track_url": "https://plat-music.ru/track/42", "cover_url": "https://plat-music.ru/cover/42.jpg"}


@pytest.mark.parametrize("source", ["plat", "plat_music", "plat-music", "Plat Music", "platmusic"])
@pytest.mark.parametrize("auth", ["header", "bearer", "body"])
def test_partner_receives_track_and_diagnostics(client, db, plat_account, source, auth):
    user, _, token, owner = plat_account
    data = payload(source)
    headers = {}
    if auth == "body":
        data["api_key"] = token
    else:
        headers = {"X-API-Key": token} if auth == "header" else {"Authorization": f"Bearer {token}"}
    response = client.post("/api/scrobble", json=data, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ok"
    row = db.query(Scrobble).one()
    assert row.user_id == user.id
    assert row.source == "plat"
    assert row.track.title == data["title"]
    assert row.track.track_url == data["track_url"]
    assert db.query(SourceHealth).one().source == "plat"
    check = client.get("/api/me/connection-check?source=plat", headers=owner).json()
    assert check["received"] is True
    assert check["counted"] is False
    assert client.get("/api/me/connection-check?source=extension", headers=owner).json()["received"] is False
    services = client.get("/api/integrations/status", headers=owner).json()["services"]
    service = next(item for item in services if item["id"] == "plat")
    assert service["mode"] == "partner"
    assert service["linked"] is True
    assert service["last_event_at"] is not None


def test_progress_pause_and_repeated_reports_do_not_duplicate_play(client, db, plat_account):
    _, _, token, _ = plat_account
    auth = {"X-API-Key": token}
    assert client.post("/api/scrobble", json=payload(), headers=auth).json()["status"] == "ok"
    row = db.query(Scrobble).one()
    row.updated_at = datetime.now(UTC) - timedelta(seconds=15)
    db.commit()
    assert client.post("/api/scrobble", json=payload("Plat Music", 15), headers=auth).json()["status"] == "ok"
    db.expire_all()
    row = db.query(Scrobble).one()
    assert 15 <= row.listened_sec <= 16
    before_pause = row.listened_sec
    row.updated_at = datetime.now(UTC) - timedelta(seconds=15)
    db.commit()
    assert client.post("/api/scrobble", json=payload(progress=30, playing=False), headers=auth).json()["status"] == "ok"
    db.expire_all()
    row = db.query(Scrobble).one()
    assert row.is_playing is False
    # The pause is reported when it happens: the 15 s before it were played
    assert row.listened_sec == before_pause + 15
    paused = row.listened_sec
    row.updated_at = datetime.now(UTC) - timedelta(seconds=15)
    db.commit()
    client.post("/api/scrobble", json=payload(progress=30, playing=False), headers=auth)
    db.expire_all()
    assert db.query(Scrobble).count() == 1
    assert db.query(Scrobble).one().listened_sec == paused


@pytest.mark.parametrize("section,settings,status", [
    ("integrations", {"plat_enabled": False}, "integration_paused"),
    ("integrations", {"auto_sync": False}, "integration_paused"),
    ("listening", {"ignored_sources": ["plat"]}, "source_ignored"),
])
def test_partner_respects_preferences(client, db, plat_account, section, settings, status):
    user, _, token, owner = plat_account
    response = client.put("/api/profile/preferences", json={section: settings}, headers=owner)
    assert response.status_code == 200, response.text
    assert client.post("/api/scrobble", json=payload(), headers={"X-API-Key": token}).json()["status"] == status
    assert db.query(Scrobble).filter_by(user_id=user.id).count() == 0


@pytest.mark.parametrize("auth_style", ["header", "body"])
def test_revoked_or_read_only_key_cannot_write(client, db, plat_account, auth_style):
    _, key, token, _ = plat_account
    auth = {"X-API-Key": token} if auth_style == "header" else {}
    data = payload()
    if auth_style == "body":
        data["api_key"] = token
    key.scopes = "profile:read"
    db.commit()
    assert client.post("/api/scrobble", json=data, headers=auth).status_code == 403
    key.is_active = False
    db.commit()
    assert client.post("/api/scrobble", json=data, headers=auth).status_code == 401
    assert db.query(Scrobble).count() == 0


def test_header_credentials_keep_precedence_over_body(client, db, plat_account):
    _, _, token, _ = plat_account
    data = payload()
    data["api_key"] = token
    response = client.post("/api/scrobble", json=data, headers={"X-API-Key": "invalid"})
    assert response.status_code == 401
    assert db.query(Scrobble).count() == 0


def test_live_partner_play_counts_after_threshold(client, db, plat_account):
    _, _, token, owner = plat_account
    auth = {"X-API-Key": token}
    client.post("/api/scrobble", json=payload(), headers=auth)
    for progress in range(21, 169, 21):
        row = db.query(Scrobble).one()
        row.updated_at = datetime.now(UTC) - timedelta(seconds=21)
        db.commit()
        assert client.post("/api/scrobble", json=payload(progress=progress), headers=auth).json()["status"] == "ok"
        db.expire_all()
    row = db.query(Scrobble).one()
    assert row.listened_sec >= 153
    assert row.xp_earned > 0
    assert client.get("/api/me/connection-check?source=plat", headers=owner).json()["counted"] is True


# --- Playback as the Plat Music player reports it -------------------------
# The player sends a report 0.8 s after a track change or play/pause and a
# heartbeat every 15 s while playing; seeking, "previous" (restart) and
# repeat-one are only visible through the position in the next heartbeat.

def _plat(token, title="Partner Track", progress=0, playing=True, duration=180):
    data = payload(progress=progress, playing=playing)
    data.update(title=title, duration=duration)
    return {"json": data, "headers": {"X-API-Key": token}}


def _wait(db, seconds):
    """The time since the latest report (instead of sleeping)."""
    row = db.query(Scrobble).order_by(Scrobble.id.desc()).first()
    row.updated_at = row.updated_at.replace(tzinfo=row.updated_at.tzinfo or UTC) - timedelta(seconds=seconds)
    row.played_at = row.played_at.replace(tzinfo=row.played_at.tzinfo or UTC) - timedelta(seconds=seconds)
    db.commit()
    db.expire_all()


def _live(client, user):
    return client.get(f"/api/history/{user.username}", headers={"Accept": "application/json"}).json()["history"][0]


def _position(item):
    """Where the VEIN timer stands now (what the profile shows)."""
    from datetime import datetime as dt
    shown = dt.fromisoformat(item["updated_at"])
    age = (datetime.now(UTC) - shown).total_seconds() if item["is_playing"] else 0
    return item["position_sec"] + age


def test_pause_and_resume_right_after_a_heartbeat_are_kept(client, db, plat_account):
    user, _, token, _ = plat_account
    client.post("/api/scrobble", **_plat(token))
    _wait(db, 15)
    assert client.post("/api/scrobble", **_plat(token, progress=15)).json()["status"] == "ok"
    _wait(db, 1.3)
    assert client.post("/api/scrobble", **_plat(token, progress=16.3, playing=False)).json()["status"] == "ok"
    assert db.query(Scrobble).one().is_playing is False
    _wait(db, 0.9)
    assert client.post("/api/scrobble", **_plat(token, progress=16.3)).json()["status"] == "ok"
    assert db.query(Scrobble).one().is_playing is True


def test_pause_credits_the_stretch_since_the_heartbeat_and_shows_player_time(client, db, plat_account):
    user, _, token, _ = plat_account
    client.post("/api/scrobble", **_plat(token))
    _wait(db, 15)
    client.post("/api/scrobble", **_plat(token, progress=15))
    _wait(db, 9)
    client.post("/api/scrobble", **_plat(token, progress=24, playing=False))
    row = db.query(Scrobble).one()
    assert 24 <= row.listened_sec <= 25
    item = _live(client, user)
    assert item["is_playing"] is False
    assert item["position_sec"] == 24
    _wait(db, 300)  # a long pause neither moves the timer nor adds listening
    client.post("/api/scrobble", **_plat(token, progress=24))
    db.expire_all()
    assert db.query(Scrobble).one().listened_sec == row.listened_sec
    assert 24 <= _position(_live(client, user)) < 25


def test_timer_follows_resumed_and_seeked_position(client, db, plat_account):
    user, _, token, _ = plat_account
    client.post("/api/scrobble", **_plat(token, progress=90.4))  # restored after a reload
    assert 90 <= _position(_live(client, user)) < 91
    _wait(db, 15)
    client.post("/api/scrobble", **_plat(token, progress=150))  # seek forward
    row = db.query(Scrobble).one()
    assert 15 <= row.listened_sec <= 16  # listening, not the jump
    assert 150 <= _position(_live(client, user)) < 151
    _wait(db, 15)
    client.post("/api/scrobble", **_plat(token, progress=40))  # seek back
    assert 40 <= _position(_live(client, user)) < 41
    db.expire_all()
    assert db.query(Scrobble).count() == 1
    assert 30 <= db.query(Scrobble).one().listened_sec <= 31


def test_track_change_credits_previous_track_and_is_not_dropped(client, db, plat_account):
    _, _, token, _ = plat_account
    client.post("/api/scrobble", **_plat(token, title="First"))
    for progress in range(15, 151, 15):
        _wait(db, 15)
        client.post("/api/scrobble", **_plat(token, title="First", progress=progress))
    _wait(db, 0.9)  # a skip right after the heartbeat
    assert client.post("/api/scrobble", **_plat(token, title="Second")).json()["status"] == "ok"
    first, second = db.query(Scrobble).order_by(Scrobble.id).all()
    assert 150 <= first.listened_sec <= 151
    assert first.is_playing is False
    assert second.track.title == "Second"
    assert second.is_playing is True
    for progress in (15, 30, 45, 60, 75, 90, 105, 120, 135, 150):
        _wait(db, 15)
        client.post("/api/scrobble", **_plat(token, title="Second", progress=progress))
    _wait(db, 7)  # the track ends, the next one starts
    client.post("/api/scrobble", **_plat(token, title="Third"))
    db.expire_all()
    second = db.query(Scrobble).filter(Scrobble.id == second.id).one()
    assert 157 <= second.listened_sec <= 158
    assert second.xp_earned > 0  # crossed 85 % only with the final stretch


def test_repeat_one_restart_counts_a_new_play(client, db, plat_account):
    _, _, token, _ = plat_account
    client.post("/api/scrobble", **_plat(token, duration=172))
    for progress in range(15, 166, 15):
        _wait(db, 15)
        client.post("/api/scrobble", **_plat(token, progress=progress, duration=172))
    _wait(db, 15)  # ended at 172 s and started over: 8 s into the repeat
    client.post("/api/scrobble", **_plat(token, progress=8, duration=172))
    first, repeat = db.query(Scrobble).order_by(Scrobble.id).all()
    assert first.listened_sec == 172
    assert first.is_playing is False
    assert repeat.is_playing is True
    assert repeat.listened_sec == 8  # the start of the repeat already played
    # a seek back in the middle of a track is not a new play
    _wait(db, 15)
    client.post("/api/scrobble", **_plat(token, progress=23, duration=172))
    _wait(db, 15)
    client.post("/api/scrobble", **_plat(token, progress=3, duration=172))
    assert db.query(Scrobble).count() == 2


def test_back_to_back_repeats_of_a_short_track_each_count(client, db, plat_account):
    _, _, token, _ = plat_account
    client.post("/api/scrobble", **_plat(token, duration=50))
    # Heartbeats every 15 s on repeat-one: each restart is only seen in the
    # next heartbeat, 5-10 s into the new play
    for progress in (15, 30, 45, 10,  # play 1 ends at 50 s
                     25, 40, 5,  # play 2
                     20, 35, 50, 15):  # play 3 (a late heartbeat at the very end)
        _wait(db, 15)
        client.post("/api/scrobble", **_plat(token, progress=progress, duration=50))
    plays = db.query(Scrobble).order_by(Scrobble.id).all()
    assert len(plays) == 4
    assert [p.listened_sec for p in plays[:3]] == [50, 50, 50]
    assert all(p.xp_earned > 0 for p in plays[:3])


def test_non_finite_position_is_rejected(client, plat_account):
    _, _, token, _ = plat_account
    request = _plat(token)
    body = json.dumps(request["json"]).replace('"progress_sec": 0', '"progress_sec": NaN')
    response = client.post("/api/scrobble", content=body,
                           headers={**request["headers"], "Content-Type": "application/json"})
    assert response.status_code == 422
