"""Add unique constraints for follows, likes and user achievements

Revision ID: d4e5f6a7b8c9
Revises: b2c3d4e5f6g7
Create Date: 2026-09-25 12:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: str | Sequence[str] | None = 'b2c3d4e5f6g7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UNIQUE_INDEXES = (
    ("uq_follows_follower_following", "follows", ("follower_id", "following_id")),
    ("uq_scrobble_likes_user_scrobble", "scrobble_likes", ("user_id", "scrobble_id")),
    ("uq_user_achievements_user_achievement", "user_achievements", ("user_id", "achievement_id")),
)


def upgrade() -> None:
    """Remove existing duplicates (keeping the oldest row), then enforce uniqueness."""
    existing = {
        table: {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}
        for _name, table, _cols in _UNIQUE_INDEXES
    }
    for name, table, (col_a, col_b) in _UNIQUE_INDEXES:
        if name in existing[table]:
            continue  # already created (e.g. by create_all)
        op.execute(
            f"DELETE FROM {table} WHERE id NOT IN ("
            f"SELECT keep_id FROM (SELECT MIN(id) AS keep_id FROM {table} "
            f"GROUP BY {col_a}, {col_b}) AS keep_rows)"
        )
        op.create_index(name, table, [col_a, col_b], unique=True)


def downgrade() -> None:
    for name, table, _cols in reversed(_UNIQUE_INDEXES):
        op.drop_index(name, table_name=table)
