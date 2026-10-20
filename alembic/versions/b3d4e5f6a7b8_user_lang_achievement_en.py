"""users.lang and English achievement texts

Revision ID: b3d4e5f6a7b8
Revises: a1c2e3f4b5d6
Create Date: 2026-10-20
"""

import sqlalchemy as sa

from alembic import op

revision = "b3d4e5f6a7b8"
down_revision = "a1c2e3f4b5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("lang", sa.String(length=2), server_default="ru", nullable=False))
    op.add_column("achievements", sa.Column("name_en", sa.String(), nullable=True))
    op.add_column("achievements", sa.Column("description_en", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("achievements", "description_en")
    op.drop_column("achievements", "name_en")
    op.drop_column("users", "lang")
