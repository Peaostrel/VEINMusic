"""Library reliability, discovery history and individual sessions."""
from alembic import op
import sqlalchemy as sa

revision = "7e9a2c6d8f01"
down_revision = "68f2a91c0d47"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("scrobbles", sa.Column("confirmed_sources", sa.JSON(), nullable=True))
    op.add_column("scrobbles", sa.Column("credit_source", sa.String(), nullable=True))
    op.add_column("scrobbles", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_scrobbles_deleted_at", "scrobbles", ["deleted_at"])
    op.create_index("ix_scrobbles_user_time_id", "scrobbles", ["user_id", "played_at", "id"])
    op.create_index("ix_scrobbles_user_track", "scrobbles", ["user_id", "excluded_from_stats", "deleted_at", "track_id"])
    op.create_table("history_changes", sa.Column("id", sa.String(32), primary_key=True),
                    sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("payload", sa.JSON(), nullable=False),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("undone", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_index("ix_history_changes_user_id", "history_changes", ["user_id"])
    op.create_index("ix_history_changes_expires_at", "history_changes", ["expires_at"])
    for name in ("listen_later", "recommendation_impressions"):
        columns = [sa.Column("id", sa.Integer(), primary_key=True),
                   sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                   sa.Column("track_id", sa.Integer(), sa.ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)]
        if name == "listen_later":
            columns += [sa.Column("note", sa.String(1000), nullable=False, server_default=""), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)]
        else:
            columns += [sa.Column("shown_at", sa.DateTime(timezone=True), nullable=False)]
        op.create_table(name, *columns)
        op.create_index(f"ix_{name}_user_id", name, ["user_id"])
        op.create_index(f"uq_{name}_user_track", name, ["user_id", "track_id"], unique=True)
    op.create_table("user_sessions", sa.Column("id", sa.String(32), primary_key=True),
                    sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("device", sa.String(100), nullable=False), sa.Column("session_version", sa.Integer(), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])


def downgrade():
    for name in ("user_sessions", "recommendation_impressions", "listen_later", "history_changes"):
        op.drop_table(name)
    for name in ("ix_scrobbles_user_time_id", "ix_scrobbles_user_track", "ix_scrobbles_deleted_at"):
        op.drop_index(name, table_name="scrobbles")
    for name in ("deleted_at", "credit_source", "confirmed_sources"):
        op.drop_column("scrobbles", name)
