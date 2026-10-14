"""Player-reported position of the playing scrobble (Plat Music)

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-10-14 20:30:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c5d6e7f8a9b0'
down_revision: str | Sequence[str] | None = 'b4c5d6e7f8a9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("scrobbles")}
    if "position_sec" in columns:
        return
    op.add_column("scrobbles", sa.Column("position_sec", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("scrobbles", "position_sec")
