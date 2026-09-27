"""Unconfirmed listening of the playing scrobble (live player connections)

Revision ID: b1c2d3e4f5a6
Revises: a9b8c7d6e5f4
Create Date: 2026-09-27 21:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: str | Sequence[str] | None = 'a9b8c7d6e5f4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("scrobbles")}
    if "pending_sec" in columns:
        return
    op.add_column("scrobbles", sa.Column("pending_sec", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("scrobbles", "pending_sec")
