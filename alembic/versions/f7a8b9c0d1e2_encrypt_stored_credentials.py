"""Encrypt stored third-party credentials

Encrypts existing plaintext OAuth tokens, session keys and webhook secrets
with app.core.crypto (TOKEN_ENCRYPTION_KEY or a key derived from SECRET_KEY,
so the same environment as the application must be used).

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-09-26 11:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.crypto import PREFIX, decrypt_value, encrypt_value

# revision identifiers, used by Alembic.
revision: str = 'f7a8b9c0d1e2'
down_revision: str | Sequence[str] | None = 'e5f6a7b8c9d0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# table -> (primary key, [encrypted columns])
_COLUMNS = {
    "user_integrations": ("user_id", ["yandex_token", "spotify_access_token", "spotify_refresh_token"]),
    "external_sync_configs": ("id", ["lastfm_session_key", "listenbrainz_token", "librefm_session_key"]),
    "webhooks": ("id", ["secret"]),
}


def _transform(convert, needs_conversion) -> None:
    bind = op.get_bind()
    for table, (pk, columns) in _COLUMNS.items():
        rows = bind.execute(sa.text(f"SELECT {pk}, {', '.join(columns)} FROM {table}")).mappings().all()
        for row in rows:
            updates = {c: convert(row[c]) for c in columns
                       if row[c] is not None and needs_conversion(row[c])}
            if updates:
                assignments = ", ".join(f"{c} = :{c}" for c in updates)
                bind.execute(sa.text(f"UPDATE {table} SET {assignments} WHERE {pk} = :pk"),
                             {**updates, "pk": row[pk]})


def upgrade() -> None:
    _transform(encrypt_value, lambda v: not v.startswith(PREFIX))


def downgrade() -> None:
    _transform(decrypt_value, lambda v: v.startswith(PREFIX))
