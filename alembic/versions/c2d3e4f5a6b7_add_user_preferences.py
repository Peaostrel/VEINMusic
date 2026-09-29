"""Add versioned user preferences JSON storage.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-09-28 20:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: str | Sequence[str] | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns("user_profiles")
    }
    if "preferences" not in columns:
        op.add_column(
            "user_profiles",
            sa.Column(
                "preferences",
                sa.String(),
                server_default=sa.text("'{}'"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    op.drop_column("user_profiles", "preferences")
