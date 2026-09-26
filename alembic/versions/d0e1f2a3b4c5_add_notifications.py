"""Social notifications (likes, comments, follows)

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-09-26 18:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd0e1f2a3b4c5'
down_revision: str | Sequence[str] | None = 'c9d0e1f2a3b4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "notifications" in insp.get_table_names():
        return
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("scrobble_id", sa.Integer(), sa.ForeignKey("scrobbles.id", ondelete="CASCADE"), nullable=True),
        sa.Column("message", sa.String(length=200), nullable=True),
        sa.Column("is_read", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_notifications_id", "notifications", ["id"])
    op.create_index("ix_notifications_actor_id", "notifications", ["actor_id"])
    op.create_index("ix_notifications_scrobble_id", "notifications", ["scrobble_id"])
    op.create_index("ix_notifications_user_unread", "notifications", ["user_id", "is_read", "created_at"])


def downgrade() -> None:
    op.drop_table("notifications")
