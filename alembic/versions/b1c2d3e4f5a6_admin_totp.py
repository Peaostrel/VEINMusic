"""Encrypted two-factor credentials and replay prevention.

Revision ID: b1c2d3e4f5a6
Revises: a9b0c1d2e3f4
"""
from alembic import op
import sqlalchemy as sa

revision = "b1c2d3e4f5a6"
down_revision = "a9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("totp_secret", sa.String(), nullable=True))
    op.add_column("users", sa.Column("totp_last_step", sa.Integer(), nullable=False, server_default=sa.text("-1")))
    op.add_column("users", sa.Column("totp_setup_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("totp_recovery_codes", sa.String(), nullable=True))


def downgrade():
    for column in ("totp_recovery_codes", "totp_setup_expires_at", "totp_last_step", "totp_secret", "totp_enabled"):
        op.drop_column("users", column)
