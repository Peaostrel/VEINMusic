"""Image uploads."""

import os
import re
import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse

from app.core.rate_limit import credential_key, limiter
from app.core.security import get_current_user
from app.models import (
    User,
)

router = APIRouter(tags=["media"])

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__))))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

MIME_IMAGE_JPEG = "image/jpeg"
MIME_IMAGE_PNG = "image/png"
MIME_IMAGE_GIF = "image/gif"
MIME_IMAGE_WEBP = "image/webp"


def _is_valid_image_bytes(content: bytes, content_type: str) -> bool:
    if content_type == MIME_IMAGE_JPEG:
        return content.startswith(b"\xFF\xD8\xFF")
    if content_type == MIME_IMAGE_PNG:
        return content.startswith(b"\x89PNG\r\n\x1A\n")
    if content_type == MIME_IMAGE_GIF:
        return content.startswith((b"GIF87a", b"GIF89a"))
    if content_type == MIME_IMAGE_WEBP:
        return len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    return False


def _save_file_sync(file_path: str, content: bytes):
    with open(file_path, "wb") as buffer:
        buffer.write(content)


# --- POST /api/upload ---
@router.post("/api/upload",
             responses={400: {"description": "Invalid file type or file too large"}})
@limiter.limit("30/hour", key_func=credential_key)
async def upload_file(request: Request,
                      current_user: Annotated[User, Depends(get_current_user)],
                      file: Annotated[UploadFile, File()]):
    import anyio
    # Security: Validate file type
    allowed_types = [MIME_IMAGE_JPEG, MIME_IMAGE_PNG, MIME_IMAGE_WEBP, MIME_IMAGE_GIF]
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Только изображения (JPG, PNG, WEBP, GIF)")

    # Security: Validate file size (max 5MB) without reading an arbitrarily
    # large upload into memory
    MAX_SIZE = 5 * 1024 * 1024
    content = await file.read(MAX_SIZE + 1)
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "Файл слишком большой (макс. 5МБ)")

    if not _is_valid_image_bytes(content, file.content_type):
        raise HTTPException(400, "Некорректный формат или поврежденный файл изображения")

    mime_to_ext = {
        MIME_IMAGE_JPEG: "jpg",
        MIME_IMAGE_PNG: "png",
        MIME_IMAGE_WEBP: "webp",
        MIME_IMAGE_GIF: "gif"
    }
    ext = mime_to_ext.get(file.content_type, "jpg")
    filename = f"{uuid.uuid4().hex}.{ext}"
    # codeql[py/path-injection] - uuid is safe
    file_path = os.path.join(UPLOADS_DIR, filename)
    await anyio.to_thread.run_sync(_save_file_sync, file_path, content)
    return {"url": f"{API_BASE_URL}/uploads/{filename}"}


# --- GET /uploads/{filename} ---
@router.get("/uploads/{filename}",
            responses={400: {"description": "Invalid path"},
                       404: {"description": "File not found"}})
async def get_upload(filename: str):
    if not re.match(r'^[\w\-. ]+$', filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Use basename to completely defeat path traversal
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOADS_DIR, safe_filename)

    # Path traversal protection (double check)
    real_path = os.path.abspath(file_path)
    real_uploads_dir = os.path.abspath(UPLOADS_DIR)
    if not real_path.startswith(real_uploads_dir):
        raise HTTPException(status_code=400, detail="Invalid path")

    if os.path.exists(real_path):
        return FileResponse(real_path, headers={"X-Content-Type-Options": "nosniff"})
    raise HTTPException(status_code=404, detail="Файл не найден")
