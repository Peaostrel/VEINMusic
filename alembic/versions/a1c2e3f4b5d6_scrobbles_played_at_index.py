"""Index plays by time for site-wide period queries (rankings, admin stats).

Revision ID: a1c2e3f4b5d6
Revises: 9bf5515a903d
"""

from alembic import op

revision = "a1c2e3f4b5d6"
down_revision = "9bf5515a903d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        # The table is large and written on every play: build without a lock.
        with op.get_context().autocommit_block():
            op.create_index("ix_scrobbles_played_at", "scrobbles", ["played_at"],
                            postgresql_concurrently=True, if_not_exists=True)
    else:
        op.create_index("ix_scrobbles_played_at", "scrobbles", ["played_at"])


def downgrade() -> None:
    op.drop_index("ix_scrobbles_played_at", table_name="scrobbles")
