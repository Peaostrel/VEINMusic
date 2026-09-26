"""Delete uploaded images that nothing refers to any more.

Every avatar/cover change uploads a new file and the old one stays on disk.
A daily worker job removes files that are older than a day (so an upload
that is about to be saved is never touched) and not referenced by any
column that can hold an upload URL.
"""
from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import Achievement, AvatarFrame, SystemAnnouncement, Track, UserProfile

logger = logging.getLogger(__name__)

MIN_AGE_SEC = 24 * 3600
# Only names produced by POST /api/upload (uuid4 hex + image extension)
_UPLOAD_FILE_RE = re.compile(r"^[0-9a-f]{32}\.(?:jpg|png|webp|gif)$")
_UPLOAD_REF_RE = re.compile(r"/uploads/([0-9a-f]{32}\.(?:jpg|png|webp|gif))")

# Columns that may contain an upload URL (the settings page for avatars and
# covers; admins can paste upload URLs into frames, achievements and
# announcements)
_REFERENCING_COLUMNS: tuple[Any, ...] = (
    UserProfile.avatar_url,
    UserProfile.cover_url,
    Track.cover_url,
    Achievement.target_image,
    AvatarFrame.image_url,
    SystemAnnouncement.message,
)


def referenced_uploads(db: Session) -> set[str]:
    names: set[str] = set()
    for column in _REFERENCING_COLUMNS:
        for (value,) in db.query(column).filter(column.like("%/uploads/%")):
            names.update(_UPLOAD_REF_RE.findall(str(value)))
    return names


def cleanup_orphan_uploads(db: Session, uploads_dir: str, now: Optional[float] = None) -> int:
    """Remove unreferenced uploads older than MIN_AGE_SEC. Returns the count."""
    if not os.path.isdir(uploads_dir):
        return 0
    now = time.time() if now is None else now
    keep = referenced_uploads(db)
    removed = 0
    for name in os.listdir(uploads_dir):
        if not _UPLOAD_FILE_RE.match(name) or name in keep:
            continue
        path = os.path.join(uploads_dir, name)
        try:
            if now - os.path.getmtime(path) < MIN_AGE_SEC:
                continue
            os.remove(path)
            removed += 1
        except OSError as e:
            logger.warning(f"[Uploads] could not remove {name}: {e}")
    if removed:
        logger.info(f"[Uploads] removed {removed} unreferenced file(s)")
    return removed
