"""Network the device pairing code was requested from (keyed hash)

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-10-14 23:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd6e7f8a9b0c1'
down_revision: str | Sequence[str] | None = 'c5d6e7f8a9b0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("device_authorizations")}
    if "requester_network" in columns:
        return
    op.add_column("device_authorizations", sa.Column("requester_network", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("device_authorizations", "requester_network")
