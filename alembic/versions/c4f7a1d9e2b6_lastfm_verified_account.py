"""Remember whether the Last.fm account name came from signing in to Last.fm

The history import is allowed only for an account the user proved to own.

Revision ID: c4f7a1d9e2b6
Revises: f1a2b3c4d5e6
Create Date: 2026-10-24 19:40:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4f7a1d9e2b6"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_integrations", sa.Column(
        "lastfm_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("user_integrations", "lastfm_verified")
