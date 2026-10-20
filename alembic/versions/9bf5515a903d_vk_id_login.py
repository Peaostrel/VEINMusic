"""Link a VK ID account for signing in.

Revision ID: 9bf5515a903d
Revises: c3d4e5f6a7b8
"""

import sqlalchemy as sa

from alembic import op

revision = "9bf5515a903d"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("vk_id", sa.String(length=32), nullable=True))
    op.create_index("ix_users_vk_id", "users", ["vk_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_vk_id", table_name="users")
    op.drop_column("users", "vk_id")
