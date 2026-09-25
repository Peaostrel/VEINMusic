"""Device pairing table and resumable Last.fm import progress

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-09-26 14:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: str | Sequence[str] | None = 'b8c9d0e1f2a3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_JOB_COLUMNS = (
    sa.Column("window_from", sa.Integer(), nullable=True),
    sa.Column("window_to", sa.Integer(), nullable=True),
    sa.Column("current_page", sa.Integer(), server_default=sa.text("0"), nullable=False),
    sa.Column("total_pages", sa.Integer(), server_default=sa.text("0"), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
)


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    existing = {c["name"] for c in insp.get_columns("lastfm_import_jobs")}
    for column in _JOB_COLUMNS:
        if column.name not in existing:
            op.add_column("lastfm_import_jobs", column.copy())

    if "device_authorizations" not in insp.get_table_names():
        op.create_table(
            "device_authorizations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("device_code_hash", sa.String(), nullable=False),
            sa.Column("user_code", sa.String(), nullable=False),
            sa.Column("client_name", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_device_authorizations_id", "device_authorizations", ["id"])
        op.create_index("ix_device_authorizations_device_code_hash", "device_authorizations",
                        ["device_code_hash"], unique=True)
        op.create_index("ix_device_authorizations_user_code", "device_authorizations",
                        ["user_code"], unique=True)
        op.create_index("ix_device_authorizations_user_id", "device_authorizations", ["user_id"])


def downgrade() -> None:
    op.drop_table("device_authorizations")
    for column in reversed(_JOB_COLUMNS):
        op.drop_column("lastfm_import_jobs", column.name)
