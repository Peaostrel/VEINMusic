import pytest
import datetime
from unittest.mock import patch
from app.models import User, Scrobble, Track, UserAchievement, Achievement, ScrobbleLike, ScrobbleComment
from app.core.security import get_current_user, get_current_user_optional
from app.main import app
from app.database import SessionLocal

@pytest.fixture
def auth_client(client):
    client.post("/auth/register", json={
        "username": "scrobbler",
        "password": "password"
    })
    client.headers["Origin"] = "http://localhost:3000"
    yield client

@pytest.fixture
def test_user(db, auth_client):
    db.close()
    db = SessionLocal()
    return db.query(User).filter(User.username == "scrobbler").first()

def test_add_scrobble_success(auth_client, db, test_user):
    # Perform a scrobble
    payload = {
        "title": "Кукла колдуна",
        "artist": "Король и Шут",
        "source": "yandex",
        "progress_sec": 200,
        "duration": 200,
        "is_playing": False,
        "album": "Акустический альбом"
    }
    
    # We patch run_check_achievements_bg where it is defined to avoid run_sync/threadpool complexity in tests
    with patch("app.routers.extended.run_check_achievements_bg") as mock_bg:
        resp = auth_client.post("/api/scrobble", json=payload)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        
        # Verify background achievements check was queued
        mock_bg.assert_called_once_with(test_user.id)
        
    db.close()
    db = SessionLocal()
        
    # Verify DB has the scrobble and track
    track = db.query(Track).filter_by(title="Кукла колдуна", artist="Король и Шут").first()
    assert track is not None
    assert track.album == "Акустический альбом"
    
    scrobble = db.query(Scrobble).filter_by(user_id=test_user.id, track_id=track.id).first()
    assert scrobble is not None
    assert scrobble.listened_sec == 0

def test_auto_achievements_flow(auth_client, db, test_user):
    # Seed 1 scrobble and trigger check_auto_achievements manually
    track = Track(title="Song 1", artist="Artist 1", duration=150)
    db.add(track)
    db.commit()
    
    scrobble = Scrobble(
        user_id=test_user.id,
        track_id=track.id,
        played_at=datetime.datetime.now(datetime.timezone.utc),
        listened_sec=150,
        xp_earned=1,
        source="yandex"
    )
    db.add(scrobble)
    db.commit()
    
    # Check level info / achievements check
    from app.routers.extended import check_auto_achievements, get_user_level_info
    check_auto_achievements(test_user, db)
    
    # Verify achievement 'Первые шаги' is earned
    ach = db.query(Achievement).filter_by(rule_type="total_scrobbles").first()
    user_ach = db.query(UserAchievement).filter_by(user_id=test_user.id, achievement_id=ach.id).first()
    assert user_ach is not None
    
    # Verify level calculation
    level, rank, total_xp, theme = get_user_level_info(test_user, db)
    assert level >= 1
    assert rank in ["Турист", "Меломан", "Аудиофил", "Маньяк", "Легенда", "Божество"]

def test_anti_cheat_triggered(auth_client, db, test_user):
    track = Track(title="Cheat", artist="Cheater", duration=120)
    db.add(track)
    db.commit()
    
    # Insert 45 scrobbles in the last hour
    now = datetime.datetime.now(datetime.timezone.utc)
    for i in range(45):
        s = Scrobble(user_id=test_user.id, track_id=track.id, played_at=now, listened_sec=120, source="yandex")
        db.add(s)
    db.commit()
    
    # Perform another scrobble
    payload = {
        "title": "Cheat 2",
        "artist": "Cheater",
        "source": "yandex",
        "progress_sec": 120,
        "duration": 120,
        "is_playing": False
    }
    resp = auth_client.post("/api/scrobble", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "flagged"
    assert "Anti-Cheat" in resp.json()["message"]

def test_history_privacy(client, db, test_user):
    client.cookies.clear()
    # Check public history
    u = db.query(User).filter_by(username=test_user.username).first()
    u.profile.is_private = False
    db.commit()
    
    resp = client.get(f"/api/history/{test_user.username}")
    assert resp.status_code == 200
    
    # Check private history (unauthorized guest)
    u.profile.is_private = True
    db.commit()
    
    resp = client.get(f"/api/history/{test_user.username}")
    assert resp.status_code == 403
    assert "Это приватный профиль" in resp.text
    
    # Check private history (owner authorized via cookie)
    from app.core.security import create_session_token
    token = create_session_token(test_user.username, test_user.hashed_password)
    client.cookies.set("api_key", token)
    resp = client.get(f"/api/history/{test_user.username}")
    assert resp.status_code == 200

def test_global_history_excludes_private(client, db, test_user):
    # Set user private
    u = db.query(User).filter_by(username=test_user.username).first()
    u.profile.is_private = True
    track = Track(title="Private Track", artist="Private Artist", duration=200)
    db.add(track)
    db.commit()
    s = Scrobble(user_id=test_user.id, track_id=track.id, played_at=datetime.datetime.now(datetime.timezone.utc), listened_sec=200, source="yandex")
    db.add(s)
    db.commit()
    
    # Get global history
    resp = client.get("/api/global-history")
    assert resp.status_code == 200
    data = resp.json()
    
    # Verify no private tracks are in global history
    for item in data:
        assert item["title"] != "Private Track"

def test_toggle_like(auth_client, db, test_user):
    # Seed a track and scrobble
    track = Track(title="Liking track", artist="Artist", duration=150)
    db.add(track)
    db.commit()
    s = Scrobble(user_id=test_user.id, track_id=track.id, played_at=datetime.datetime.now(datetime.timezone.utc), listened_sec=150, source="yandex")
    db.add(s)
    db.commit()
    
    # Like
    resp = auth_client.post(f"/api/scrobble/{s.id}/like")
    assert resp.status_code == 200
    assert resp.json()["status"] == "liked"
    
    # Check DB
    db.close()
    db = SessionLocal()
    assert db.query(ScrobbleLike).filter_by(user_id=test_user.id, scrobble_id=s.id).count() == 1
    
    # Unlike
    resp = auth_client.post(f"/api/scrobble/{s.id}/like")
    assert resp.status_code == 200
    assert resp.json()["status"] == "unliked"
    db.close()
    db = SessionLocal()
    assert db.query(ScrobbleLike).filter_by(user_id=test_user.id, scrobble_id=s.id).count() == 0

def test_add_comment(auth_client, db, test_user):
    track = Track(title="Comment track", artist="Artist", duration=150)
    db.add(track)
    db.commit()
    s = Scrobble(user_id=test_user.id, track_id=track.id, played_at=datetime.datetime.now(datetime.timezone.utc), listened_sec=150, source="yandex")
    db.add(s)
    db.commit()
    
    resp = auth_client.post(f"/api/scrobble/{s.id}/comment", json={"content": "<b>Nice song</b>"})
    assert resp.status_code == 200
    
    # Verify comment was sanitized (HTML tags removed by sanitize_text)
    db.close()
    db = SessionLocal()
    comment = db.query(ScrobbleComment).filter_by(user_id=test_user.id, scrobble_id=s.id).first()
    assert comment is not None
    assert comment.content == "Nice song" # HTML tags stripped
