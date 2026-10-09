"""Private feedback, source diagnostics and reversible history exclusion."""
from alembic import op
import sqlalchemy as sa

revision = "a9b0c1d2e3f4"
down_revision = "e4f5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("scrobbles") as batch:
        batch.add_column(sa.Column("excluded_from_stats", sa.Boolean(), nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("import_job_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_scrobbles_import_job", "lastfm_import_jobs", ["import_job_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_scrobbles_import_job_id", ["import_job_id"])
    op.create_table("recommendation_feedback",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("track_id", sa.Integer(), sa.ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.String(16), nullable=False))
    op.create_index("uq_recommendation_feedback_user_track", "recommendation_feedback", ["user_id", "track_id"], unique=True)
    op.create_table("source_health",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("first_success_at", sa.DateTime(timezone=True)),
        sa.Column("last_success_at", sa.DateTime(timezone=True)),
        sa.Column("received_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processing_ms", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("uq_source_health_user_source", "source_health", ["user_id", "source"], unique=True)


def downgrade():
    op.drop_table("source_health")
    op.drop_table("recommendation_feedback")
    with op.batch_alter_table("scrobbles") as batch:
        batch.drop_index("ix_scrobbles_import_job_id")
        batch.drop_constraint("fk_scrobbles_import_job", type_="foreignkey")
        batch.drop_column("import_job_id")
        batch.drop_column("excluded_from_stats")
