"""Remove Listen Together profile and feature data

Revision ID: e9f0a1b2c3d4
Revises: e4f5a6b7c8d9
Create Date: 2026-10-21 00:45:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e9f0a1b2c3d4"
down_revision: str | Sequence[str] | None = "e4f5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "user_profiles" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("user_profiles")}
        if "sync_privacy" in columns:
            with op.batch_alter_table("user_profiles") as batch_op:
                batch_op.drop_column("sync_privacy")
    if "feature_flags" in inspector.get_table_names():
        flags = sa.table("feature_flags", sa.column("key", sa.String))
        bind.execute(flags.delete().where(flags.c.key == "listen_together"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "user_profiles" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("user_profiles")}
        if "sync_privacy" not in columns:
            with op.batch_alter_table("user_profiles") as batch_op:
                batch_op.add_column(sa.Column(
                    "sync_privacy",
                    sa.String(),
                    nullable=True,
                    server_default="all",
                ))
