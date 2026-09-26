"""Unlock empty showcase favorites

Saving the settings form used to treat an empty favorite ("" vs NULL) as a
change and lock all three showcase fields for 30 days, so every later save
failed. A lock on a favorite that is not set protects nothing: drop it.

Revision ID: c7d8e9f0a1b2
Revises: f2a3b4c5d6e7
Create Date: 2026-09-26 21:00:00.000000

"""
from typing import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c7d8e9f0a1b2'
down_revision: str | Sequence[str] | None = 'f2a3b4c5d6e7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FIELDS = ("favorite_artist", "favorite_track", "favorite_album")


def upgrade() -> None:
    for field in FIELDS:
        op.execute(
            f"UPDATE user_profiles SET {field}_updated_at = NULL "
            f"WHERE {field} IS NULL OR {field} = ''"
        )


def downgrade() -> None:
    # Data-only fix: the cleared timestamps were wrong and are not restored
    pass
