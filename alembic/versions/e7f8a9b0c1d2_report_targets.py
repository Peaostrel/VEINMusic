"""Reports on tracks and a snapshot of the reported profile or track

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-10-15 10:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e7f8a9b0c1d2'
down_revision: str | Sequence[str] | None = 'd6e7f8a9b0c1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("reports")}
    with op.batch_alter_table("reports") as batch:
        if "target_type" not in columns:
            batch.add_column(sa.Column("target_type", sa.String(16), nullable=False, server_default="user"))
        if "track_id" not in columns:
            batch.add_column(sa.Column("track_id", sa.Integer(), nullable=True))
            batch.create_index("ix_reports_track_id", ["track_id"])
            batch.create_foreign_key("fk_reports_track_id_tracks", "tracks", ["track_id"], ["id"],
                                     ondelete="SET NULL")
        if "target_snapshot" not in columns:
            batch.add_column(sa.Column("target_snapshot", sa.String(2000), nullable=True))
        batch.alter_column("target_user_id", existing_type=sa.Integer(), nullable=True)
    op.execute("UPDATE reports SET target_type = 'comment' WHERE comment_text IS NOT NULL")


def downgrade() -> None:
    op.execute("DELETE FROM reports WHERE target_user_id IS NULL")
    with op.batch_alter_table("reports") as batch:
        batch.alter_column("target_user_id", existing_type=sa.Integer(), nullable=False)
        batch.drop_column("target_snapshot")
        batch.drop_constraint("fk_reports_track_id_tracks", type_="foreignkey")
        batch.drop_index("ix_reports_track_id")
        batch.drop_column("track_id")
        batch.drop_column("target_type")
