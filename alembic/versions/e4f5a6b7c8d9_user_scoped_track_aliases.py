"""Allow users to keep private catalog aliases.

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: str | Sequence[str] | None = "d3e4f5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Batch mode also supports SQLite, which cannot add a foreign key to an
    # existing table with a direct ALTER statement.
    with op.batch_alter_table("track_aliases") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_track_aliases_user_id_users",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index("ix_track_aliases_user_id", ["user_id"])


def downgrade() -> None:
    with op.batch_alter_table("track_aliases") as batch_op:
        batch_op.drop_index("ix_track_aliases_user_id")
        batch_op.drop_constraint(
            "fk_track_aliases_user_id_users", type_="foreignkey"
        )
        batch_op.drop_column("user_id")
