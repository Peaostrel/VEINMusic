"""Temporary blocks of client addresses; known devices of sessions.

Revision ID: b3c4d5e6f7a8
Revises: 7e9a2c6d8f01
"""
from alembic import op
import sqlalchemy as sa

revision = "b3c4d5e6f7a8"
down_revision = "7e9a2c6d8f01"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ip_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("network", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(200), nullable=False, server_default=""),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ip_blocks_network", "ip_blocks", ["network"])
    op.create_index("ix_ip_blocks_expires_at", "ip_blocks", ["expires_at"])
    op.add_column("user_sessions", sa.Column("device_id", sa.String(32), nullable=True))
    op.create_index("ix_user_sessions_device_id", "user_sessions", ["device_id"])


def downgrade():
    op.drop_index("ix_user_sessions_device_id", table_name="user_sessions")
    op.drop_column("user_sessions", "device_id")
    op.drop_index("ix_ip_blocks_expires_at", table_name="ip_blocks")
    op.drop_index("ix_ip_blocks_network", table_name="ip_blocks")
    op.drop_table("ip_blocks")
