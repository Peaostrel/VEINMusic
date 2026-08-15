from app.models import AvatarFrame, FeatureFlag, SystemAnnouncement
from app.routers.widgets import _escape, _render_now_playing_svg, _render_top_artists_svg
from app.services.metadata_cleaner import clean_track_metadata


def test_clean_track_metadata_remastered():
    title, artist = clean_track_metadata("Bohemian Rhapsody (2011 Remaster)", "Queen")
    assert title == "Bohemian Rhapsody"
    assert artist == "Queen"


def test_clean_track_metadata_bonus_track():
    title, artist = clean_track_metadata("Starboy [Bonus Track]", "The Weeknd")
    assert title == "Starboy"
    assert artist == "The Weeknd"


def test_clean_track_metadata_feat_extraction():
    title, artist = clean_track_metadata("Die For You (feat. Ariana Grande)", "The Weeknd")
    assert title == "Die For You"
    assert "The Weeknd feat. Ariana Grande" in artist


def test_clean_track_metadata_live_and_radio_edit():
    title, _ = clean_track_metadata("Comfortably Numb - Live at Pompeii", "Pink Floyd")
    assert title == "Comfortably Numb"

    title2, _ = clean_track_metadata("In The End (Radio Edit)", "Linkin Park")
    assert title2 == "In The End"


def test_widget_escaping():
    escaped = _escape('<script>alert("xss")</script>')
    assert "<script>" not in escaped
    assert "&lt;script&gt;" in escaped


def test_now_playing_svg_generation():
    svg = _render_now_playing_svg("testuser", "Nights", "Frank Ocean", True)
    assert svg.startswith("<svg")
    assert svg.endswith("</svg>")
    assert "LISTENING NOW ON VEIN" in svg
    assert "Nights" in svg
    assert "Frank Ocean" in svg
    assert "@testuser" in svg


def test_top_artists_svg_generation():
    artists = [("The Weeknd", 450), ("Deftones", 320), ("Radiohead", 280)]
    svg = _render_top_artists_svg("audiophile", artists)
    assert svg.startswith("<svg")
    assert svg.endswith("</svg>")
    assert "TOP ARTISTS" in svg
    assert "The Weeknd" in svg
    assert "450" in svg


def test_public_announcements_endpoint(client, db):
    ann = SystemAnnouncement(title="Maintenance", message="Server upgrade tonight", type="warning", is_active=True)
    db.add(ann)
    db.commit()

    resp = client.get("/api/announcements/active")
    assert resp.status_code == 200
    data = resp.json()
    assert "announcements" in data
    assert len(data["announcements"]) >= 1
    assert data["announcements"][0]["title"] == "Maintenance"


def test_public_feature_flags_endpoint(client, db):
    flag = FeatureFlag(key="beta_dark_mode", description="Dark mode toggle", is_enabled=True)
    db.add(flag)
    db.commit()

    resp = client.get("/api/feature-flags")
    assert resp.status_code == 200
    data = resp.json()
    assert "flags" in data
    assert data["flags"].get("beta_dark_mode") is True


def test_public_avatar_frames_endpoint(client, db):
    frame = AvatarFrame(name="Cyber Gold", code="cyber_gold", rarity="legendary", required_level=5, is_active=True)
    db.add(frame)
    db.commit()

    resp = client.get("/api/frames")
    assert resp.status_code == 200
    data = resp.json()
    assert "frames" in data
    assert len(data["frames"]) >= 1
    assert data["frames"][0]["code"] == "cyber_gold"


def test_svg_widgets_endpoints(client, db):
    resp = client.get("/api/widgets/now-playing/nonexistent.svg")
    assert resp.status_code == 200
    assert "image/svg+xml" in resp.headers.get("content-type", "")
    assert "<svg" in resp.text

    resp2 = client.get("/api/widgets/top-artists/nonexistent.svg")
    assert resp2.status_code == 200
    assert "image/svg+xml" in resp2.headers.get("content-type", "")
    assert "<svg" in resp2.text
