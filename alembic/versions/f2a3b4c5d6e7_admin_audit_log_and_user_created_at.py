"""Admin audit log; users.created_at

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-09-27 14:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f2a3b4c5d6e7'
down_revision: str | Sequence[str] | None = 'e1f2a3b4c5d6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "admin_audit_log" not in insp.get_table_names():
        op.create_table(
            "admin_audit_log",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("admin_username", sa.String(length=64), nullable=False),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("target", sa.String(length=128), nullable=True),
            sa.Column("details", sa.String(length=2000), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        for column in ("id", "admin_id", "action", "target", "created_at"):
            op.create_index(f"ix_admin_audit_log_{column}", "admin_audit_log", [column])

    # Existing accounts keep NULL: their sign-up date is unknown
    if "created_at" not in {c["name"] for c in insp.get_columns("users")}:
        op.add_column("users", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
        op.create_index("ix_users_created_at", "users", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_column("users", "created_at")
    op.drop_table("admin_audit_log")
