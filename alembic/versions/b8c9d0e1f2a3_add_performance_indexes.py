"""Add indexes for per-user scrobble queries and catalog lookups

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-09-26 13:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: str | Sequence[str] | None = 'a7b8c9d0e1f2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INDEXES = (
    ("ix_scrobbles_user_id_id", "scrobbles", ["user_id", "id"]),
    ("ix_scrobbles_user_played_at", "scrobbles", ["user_id", "played_at"]),
    ("ix_scrobbles_updated_at", "scrobbles", ["updated_at"]),
    ("ix_tracks_lower_title_artist", "tracks", [sa.text("lower(title)"), sa.text("lower(artist)")]),
)


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    for name, table, columns in _INDEXES:
        if name not in {i["name"] for i in insp.get_indexes(table)}:
            op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _columns in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
