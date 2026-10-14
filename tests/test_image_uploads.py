"""Uploaded avatars and banners are fitted to the size the site shows."""
import io
import os

import pytest
from PIL import Image

from app.core.security import create_session_token
from app.models import User, UserIntegration, UserProfile
from app.services.images import InvalidImage, shrink_image


def _image(size, fmt="JPEG", mode="RGB", exif=None, **save):
    buffer = io.BytesIO()
    color = {"RGB": (200, 40, 60), "RGBA": (200, 40, 60, 120)}.get(mode, 0)
    image = Image.new(mode, size, color)
    if exif is not None:
        save["exif"] = exif
    image.save(buffer, fmt, **save)
    return buffer.getvalue()


def _gps_exif(orientation=None):
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # camera make
    exif[0x8825] = {2: (55.0, 45.0, 0.0)}  # GPS latitude
    if orientation:
        exif[0x0112] = orientation
    return exif


@pytest.fixture
def uploader(client, db, monkeypatch, tmp_path):
    import app.routers.media as media
    monkeypatch.setattr(media, "UPLOADS_DIR", str(tmp_path))
    user = User(username="image_uploader", hashed_password="x", profile=UserProfile(),
                integration=UserIntegration())
    db.add(user)
    db.commit()
    headers = {"X-API-Key": create_session_token(str(user.id), str(user.hashed_password),
                                                 int(user.session_version))}

    def upload(content, kind=None, name="photo.jpg", mime="image/jpeg"):
        data = {"kind": kind} if kind else {}
        response = client.post("/api/upload", headers=headers, data=data,
                               files={"file": (name, content, mime)})
        if response.status_code != 200:
            return response, None
        stored = tmp_path / response.json()["url"].rsplit("/", 1)[1]
        return response, stored.read_bytes()
    return upload


def test_banner_is_downscaled_and_loses_camera_and_gps_data(uploader):
    original = _image((3200, 1000), exif=_gps_exif(), quality=95)
    response, stored = uploader(original, "banner")
    assert response.json()["url"].endswith(".jpg")
    image = Image.open(io.BytesIO(stored))
    assert image.format == "JPEG"
    assert image.size == (2000, 625)
    assert not image.getexif()
    assert len(stored) < len(original)


def test_avatar_is_fitted_to_512(uploader):
    _, stored = uploader(_image((1500, 1500)), "avatar")
    assert Image.open(io.BytesIO(stored)).size == (512, 512)


def test_phone_photo_is_turned_upright(uploader):
    # Stored sideways with "rotate 90° clockwise" in EXIF
    _, stored = uploader(_image((300, 100), exif=_gps_exif(orientation=6)), "banner")
    assert Image.open(io.BytesIO(stored)).size == (100, 300)


def test_png_keeps_transparency_and_small_images_keep_their_size(uploader):
    _, stored = uploader(_image((64, 64), "PNG", "RGBA"), "avatar", "a.png", "image/png")
    image = Image.open(io.BytesIO(stored))
    assert (image.format, image.mode, image.size) == ("PNG", "RGBA", (64, 64))


def test_animated_gif_is_kept_as_is(uploader):
    frames = [Image.new("P", (40, 40), color) for color in (1, 2)]
    buffer = io.BytesIO()
    frames[0].save(buffer, "GIF", save_all=True, append_images=frames[1:], duration=100)
    _, stored = uploader(buffer.getvalue(), "avatar", "a.gif", "image/gif")
    assert stored == buffer.getvalue()


@pytest.mark.parametrize("content", [
    b"\xFF\xD8\xFF" + b"\0" * 64,  # a JPEG signature over garbage
    b"not an image at all",
])
def test_undecodable_files_are_rejected(uploader, content):
    response, _ = uploader(content, "banner")
    assert response.status_code == 400


def test_pixel_bomb_is_rejected_before_decoding():
    # 50 megapixels in a few kilobytes
    bomb = _image((10_000, 5_000), "PNG", "1")
    with pytest.raises(InvalidImage):
        shrink_image(bomb, "banner")


def test_unknown_kind_is_rejected(uploader):
    response, _ = uploader(_image((10, 10)), "wallpaper")
    assert response.status_code == 422


def test_no_upload_is_written_for_rejected_files(uploader, tmp_path):
    uploader(b"\xFF\xD8\xFF" + b"\0" * 64, "banner")
    assert os.listdir(tmp_path) == []


def test_shrink_uploads_fits_existing_banners_in_place(db, monkeypatch, tmp_path, capsys):
    from app import cli
    import app.routers.media as media
    monkeypatch.setattr(media, "UPLOADS_DIR", str(tmp_path))
    monkeypatch.setattr(cli, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)
    banner, avatar, stray = ("a" * 32 + ".jpg", "b" * 32 + ".jpg", "c" * 32 + ".jpg")
    big = _image((2560, 800), quality=95)
    for name in (banner, avatar, stray):
        (tmp_path / name).write_bytes(big)
    db.add(User(username="old_banner", hashed_password="x", integration=UserIntegration(),
                profile=UserProfile(cover_url=f"https://api.example/uploads/{banner}",
                                    avatar_url=f"https://api.example/uploads/{avatar}")))
    db.commit()

    assert cli.main(["shrink-uploads", "--dry-run"]) == 0
    assert "would save" in capsys.readouterr().out
    assert (tmp_path / banner).read_bytes() == big

    assert cli.main(["shrink-uploads"]) == 0
    assert "2 files, saved" in capsys.readouterr().out
    assert Image.open(tmp_path / banner).size == (2000, 625)
    assert Image.open(tmp_path / avatar).size == (512, 160)
    assert (tmp_path / stray).read_bytes() == big  # not referenced: untouched
    assert sorted(os.listdir(tmp_path)) == sorted([banner, avatar, stray])

    assert cli.main(["shrink-uploads"]) == 0  # nothing left to do
    assert "0 files" in capsys.readouterr().out
