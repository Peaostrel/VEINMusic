"""Encryption at rest for third-party credentials (OAuth tokens, session keys).

Values are encrypted with Fernet (AES-128-CBC + HMAC-SHA256). The key comes
from TOKEN_ENCRYPTION_KEY (one or more comma-separated Fernet keys; the first
one encrypts, all of them decrypt, which allows key rotation). If it is not
set, a key is derived from SECRET_KEY with HKDF.

Encrypted values are stored with the ``enc:v1:`` prefix; values without it are
legacy plaintext and are returned unchanged (they are encrypted by migration
f7a8b9c0d1e2 and on the next write).
"""
from __future__ import annotations

import base64
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

PREFIX = "enc:v1:"


def _derived_key(secret: str) -> bytes:
    raw = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"veinmusic-token-encryption",
               info=b"fernet").derive(secret.encode("utf-8"))
    return base64.urlsafe_b64encode(raw)


@lru_cache(maxsize=1)
def _fernet() -> MultiFernet:
    configured = [k.strip() for k in os.getenv("TOKEN_ENCRYPTION_KEY", "").split(",") if k.strip()]
    if configured:
        keys = [k.encode() for k in configured]
    else:
        from app.core.security import SECRET_KEY
        keys = [_derived_key(SECRET_KEY)]
    return MultiFernet([Fernet(k) for k in keys])


def encrypt_value(value: str | None) -> str | None:
    if value is None or value == "" or value.startswith(PREFIX):
        return value
    return PREFIX + _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_value(value: str | None) -> str | None:
    if value is None or not value.startswith(PREFIX):
        return value  # NULL or legacy plaintext
    try:
        return _fernet().decrypt(value[len(PREFIX):].encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError(
            "Cannot decrypt a stored credential: TOKEN_ENCRYPTION_KEY/SECRET_KEY changed?") from exc


class EncryptedString(TypeDecorator):
    """String column transparently encrypted with :func:`encrypt_value`."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt_value(value)

    def process_result_value(self, value, dialect):
        return decrypt_value(value)
