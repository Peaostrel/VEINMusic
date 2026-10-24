"""Remember when an admin took the antifraud flag off a user

The suspicious list is recomputed from recent plays, so taking the flag off
did nothing: the same plays listed the user again. Plays before this moment
are no longer counted.

Revision ID: e6f9c3b8d4a2
Revises: d5e8b2a7c3f1
Create Date: 2026-10-24 20:30:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e6f9c3b8d4a2"
down_revision: str | Sequence[str] | None = "d5e8b2a7c3f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("antifraud_cleared_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "antifraud_cleared_at")
