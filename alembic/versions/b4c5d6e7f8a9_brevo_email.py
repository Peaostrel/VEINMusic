"""Verified email accounts and encrypted transactional outbox."""
from alembic import op
import sqlalchemy as sa

revision = "b4c5d6e7f8a9"
down_revision = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("email_accounts",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("email", sa.String(254), nullable=True, unique=True),
        sa.Column("pending_email", sa.String(254), nullable=True),
        sa.Column("verify_hash", sa.String(64), nullable=True),
        sa.Column("verify_expires", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verify_stamp", sa.String(64), nullable=True),
        sa.Column("reset_hash", sa.String(64), nullable=True),
        sa.Column("reset_expires", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_stamp", sa.String(64), nullable=True),
        sa.Column("security_alerts", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("messages_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_table("email_outbox",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("payload", sa.String(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("next_attempt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("error_code", sa.String(40), nullable=True),
        sa.Column("message_id", sa.String(254), nullable=True))
    op.create_index("ix_email_outbox_user_id", "email_outbox", ["user_id"])
    op.create_index("ix_email_outbox_next_attempt", "email_outbox", ["next_attempt"])


def downgrade():
    op.drop_table("email_outbox")
    op.drop_table("email_accounts")
