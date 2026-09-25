"""Add users.session_version for revoking sessions

Revision ID: a7b8c9d0e1f2
Revises: f7a8b9c0d1e2
Create Date: 2026-09-26 12:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: str | Sequence[str] | None = 'f7a8b9c0d1e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    if "session_version" not in columns:
        op.add_column("users", sa.Column("session_version", sa.Integer(),
                                         server_default=sa.text("0"), nullable=False))


def downgrade() -> None:
    op.drop_column("users", "session_version")
