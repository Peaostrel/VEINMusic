"""Downscale and clean uploaded avatars and banners.

Uploads came straight from the browser's crop at the source resolution: a
phone photo cropped to a banner is 2560+ px wide and ~1 MB, downloaded on
every profile view. Images are now decoded (a real validity check), turned
upright from EXIF, stripped of metadata (camera, GPS) and fitted into the
largest size the site shows them at, for 2x screens.
"""
from __future__ import annotations

import io
import logging
from typing import Literal

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

UploadKind = Literal["avatar", "banner", "image"]

# Longest edges: a banner is at most ~1100 CSS px wide, an avatar 96-128 px.
# Anything else (admin artwork) keeps a generous bound.
MAX_SIZE: dict[str, tuple[int, int]] = {
    "avatar": (512, 512),
    "banner": (2000, 2000),
    "image": (1600, 1600),
}
JPEG_QUALITY = 82
WEBP_QUALITY = 82
# A small file must not decode into gigabytes of pixels
MAX_PIXELS = 40_000_000

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class InvalidImage(ValueError):
    """Not a decodable image of an accepted format."""


_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "GIF": "gif"}


def _encode(image: Image.Image, fmt: str, icc: bytes | None) -> bytes:
    out = io.BytesIO()
    # The color profile is kept (wide-gamut phone photos would look dull)
    extra = {"icc_profile": icc} if icc else {}
    if fmt == "JPEG":
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        image.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True, **extra)
    elif fmt == "PNG":
        image.save(out, "PNG", optimize=True, **extra)
    else:
        image.save(out, "WEBP", quality=WEBP_QUALITY, method=4, **extra)
    return out.getvalue()


def shrink_image(content: bytes, kind: str = "image") -> tuple[bytes, str]:
    """Return (bytes, extension). The format is kept (JPEG stays JPEG, so
    stored URLs and served types stay valid); animated GIFs are kept as is.

    Raises InvalidImage for anything Pillow can't decode as JPEG, PNG,
    WebP or GIF, or that is too large in pixels.
    """
    bound = MAX_SIZE.get(kind, MAX_SIZE["image"])
    try:
        image: Image.Image = Image.open(io.BytesIO(content))
        fmt = image.format or ""
        if fmt not in _FORMATS:
            raise InvalidImage(f"unsupported format {fmt!r}")
        if image.width * image.height > MAX_PIXELS:
            raise InvalidImage("too many pixels")
        if fmt == "GIF":
            image.verify()  # animation is kept: only check it decodes
            return content, "gif"
        image.load()
        original_size, had_exif = image.size, bool(image.getexif())
        icc = image.info.get("icc_profile")
        image = ImageOps.exif_transpose(image)
        if image.width > bound[0] or image.height > bound[1]:
            image.thumbnail(bound, Image.Resampling.LANCZOS)
        encoded = _encode(image, fmt, icc)
    except InvalidImage:
        raise
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
        raise InvalidImage(str(exc)) from exc
    # Re-encoding an already small, well-compressed file can make it larger:
    # keep the original only when the picture itself is unchanged
    if image.size == original_size and not had_exif and len(content) <= len(encoded):
        return content, _FORMATS[fmt]
    return encoded, _FORMATS[fmt]


def _upload_kinds(db) -> dict[str, str]:
    """Uploaded file name -> the size class it is used with."""
    from app.models import UserProfile
    from app.services.uploads_cleanup import _UPLOAD_REF_RE

    kinds: dict[str, str] = {}
    for avatar, banner in db.query(UserProfile.avatar_url, UserProfile.cover_url):
        for value, kind in ((banner, "banner"), (avatar, "avatar")):
            for name in _UPLOAD_REF_RE.findall(str(value or "")):
                # A file used as both keeps the larger (banner) size
                if kinds.get(name) != "banner":
                    kinds[name] = kind
    return kinds


def _shrunk_upload(path: str, name: str, kind: str) -> tuple[bytes, bytes] | None:
    """(original, smaller) when re-encoding the file saves bytes in the same format."""
    with open(path, "rb") as file:
        content = file.read()
    try:
        smaller, ext = shrink_image(content, kind)
    except InvalidImage as exc:
        logger.warning("[Uploads] %s left as is: %s", name, exc)
        return None
    if ext != name.rsplit(".", 1)[1] or len(smaller) >= len(content):
        return None
    return content, smaller


def _replace_file(path: str, content: bytes) -> None:
    """Atomic: a request never sees half a file."""
    import os
    import tempfile

    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".shrink-")
    try:
        with os.fdopen(fd, "wb") as file:
            file.write(content)
        os.chmod(tmp, os.stat(path).st_mode & 0o777)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def shrink_stored_uploads(db, uploads_dir: str, dry_run: bool = False) -> list[tuple[str, int, int]]:
    """Fit avatars and banners uploaded before uploads were downscaled.

    Files are rewritten in place under the same name and format, so the
    stored URLs keep working (browsers that cached the old file simply keep
    the larger copy). Returns [(file name, bytes before, bytes after)] for
    the files that got smaller.
    """
    import os

    report = []
    for name, kind in sorted(_upload_kinds(db).items()):
        path = os.path.join(uploads_dir, name)
        if not os.path.isfile(path):
            continue
        shrunk = _shrunk_upload(path, name, kind)
        if shrunk is None:
            continue
        original, smaller = shrunk
        report.append((name, len(original), len(smaller)))
        if not dry_run:
            _replace_file(path, smaller)
    return report
