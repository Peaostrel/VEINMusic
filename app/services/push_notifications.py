"""Web Push notifications (RFC 8030) with aes128gcm payload encryption
(RFC 8291) and VAPID authentication (RFC 8292).

Configuration:
  VAPID_PRIVATE_KEY  base64url raw P-256 private key (32 bytes) or a PEM key
  VAPID_PUBLIC_KEY   base64url uncompressed public key (optional: derived)
  VAPID_SUBJECT      contact URI, e.g. mailto:admin@example.com

Generate a key pair with:  python -m app.services.push_notifications
Push is disabled (endpoints report it) when no private key is configured.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import struct
import time
import urllib.parse
from functools import lru_cache
from typing import Any, Optional

import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy.orm import Session

from app.core.safe_http import UnsafeURLError, pinned_request
from app.models import PushSubscription

logger = logging.getLogger(__name__)

RECORD_SIZE = 4096
DEFAULT_TTL_SEC = 24 * 3600


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _public_bytes(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


@lru_cache(maxsize=1)
def _vapid_private_key() -> Optional[ec.EllipticCurvePrivateKey]:
    raw = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    if not raw:
        return None
    try:
        if "BEGIN" in raw:
            key = serialization.load_pem_private_key(raw.encode(), password=None)
            if not isinstance(key, ec.EllipticCurvePrivateKey):
                raise ValueError("VAPID key must be an EC (P-256) key")
            return key
        return ec.derive_private_key(int.from_bytes(_b64url_decode(raw), "big"), ec.SECP256R1())
    except Exception:
        logger.exception("Invalid VAPID_PRIVATE_KEY; Web Push disabled")
        return None


def vapid_public_key() -> Optional[str]:
    """Application server key for PushManager.subscribe(), or None if disabled."""
    key = _vapid_private_key()
    if key is None:
        return None
    return os.getenv("VAPID_PUBLIC_KEY") or _b64url_encode(_public_bytes(key.public_key()))


def is_enabled() -> bool:
    return _vapid_private_key() is not None


def encrypt_payload(plaintext: bytes, p256dh: str, auth: str, *,
                    salt: Optional[bytes] = None,
                    server_key: Optional[ec.EllipticCurvePrivateKey] = None) -> bytes:
    """Encrypt a push message body with the aes128gcm content coding (RFC 8291)."""
    ua_public = _b64url_decode(p256dh)
    auth_secret = _b64url_decode(auth)
    salt = salt or os.urandom(16)
    server_key = server_key or ec.generate_private_key(ec.SECP256R1())
    as_public = _public_bytes(server_key.public_key())

    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    ecdh_secret = server_key.exchange(ec.ECDH(), ua_key)

    ikm = HKDF(algorithm=hashes.SHA256(), length=32, salt=auth_secret,
               info=b"WebPush: info\x00" + ua_public + as_public).derive(ecdh_secret)
    cek = HKDF(algorithm=hashes.SHA256(), length=16, salt=salt,
               info=b"Content-Encoding: aes128gcm\x00").derive(ikm)
    nonce = HKDF(algorithm=hashes.SHA256(), length=12, salt=salt,
                 info=b"Content-Encoding: nonce\x00").derive(ikm)

    # Single record: payload followed by the 0x02 "last record" delimiter
    ciphertext = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)
    header = salt + struct.pack("!IB", RECORD_SIZE, len(as_public)) + as_public
    return header + ciphertext


def _vapid_authorization(endpoint: str) -> str:
    key = _vapid_private_key()
    if key is None:
        raise RuntimeError("Web Push is not configured")
    parsed = urllib.parse.urlsplit(endpoint)
    claims = {
        "aud": f"{parsed.scheme}://{parsed.netloc}",
        "exp": int(time.time()) + 12 * 3600,
        "sub": os.getenv("VAPID_SUBJECT", "mailto:admin@music.vein.guru"),
    }
    token = jwt.encode(claims, key, algorithm="ES256")  # type: ignore[arg-type]
    return f"vapid t={token}, k={vapid_public_key()}"


async def send_push_notification(subscription: PushSubscription, title: str, body: str,
                                 url: str = "/", db: Optional[Session] = None) -> bool:
    """Deliver one notification. Expired subscriptions (404/410) are deleted."""
    if not is_enabled():
        return False
    payload = json.dumps({"title": title, "body": body, "url": url}, ensure_ascii=False).encode()
    endpoint = str(subscription.endpoint)
    try:
        encrypted = encrypt_payload(payload, str(subscription.p256dh), str(subscription.auth))
        resp = await pinned_request("POST", endpoint, timeout=10.0, content=encrypted, headers={
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": str(DEFAULT_TTL_SEC),
            "Urgency": "normal",
            "Authorization": _vapid_authorization(endpoint),
        })
    except UnsafeURLError:
        logger.warning("Blocked Web Push to non-public endpoint")
        return False
    except Exception as e:
        logger.warning(f"[Push] Error sending notification: {e}")
        return False

    if resp.status_code in (404, 410) and db is not None:
        db.delete(subscription)  # the browser unsubscribed
        db.commit()
        return False
    if resp.status_code >= 400:
        logger.warning(f"[Push] Push service responded {resp.status_code}")
        return False
    return True


async def notify_user_push(user_id: int, title: str, body: str, url: str, db: Session) -> int:
    """Notify all devices of a user. Returns the number of delivered messages."""
    if not is_enabled():
        return 0
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    sent = 0
    for s in subs:
        if await send_push_notification(s, title, body, url, db=db):
            sent += 1
    return sent


def generate_vapid_keys() -> dict[str, Any]:
    key = ec.generate_private_key(ec.SECP256R1())
    private_raw = key.private_numbers().private_value.to_bytes(32, "big")
    return {
        "VAPID_PRIVATE_KEY": _b64url_encode(private_raw),
        "VAPID_PUBLIC_KEY": _b64url_encode(_public_bytes(key.public_key())),
    }


if __name__ == "__main__":
    for name, value in generate_vapid_keys().items():
        print(f"{name}={value}")  # noqa: T201
