"""Add SoundCloud OAuth and cloud scrobbling state.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-10-06 10:15:00.000000
"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "d3e4f5a6b7c8"
down_revision: str | Sequence[str] | None = "c2d3e4f5a6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns("user_integrations")
    }
    additions = {
        "soundcloud_access_token": sa.String(),
        "soundcloud_refresh_token": sa.String(),
        "soundcloud_token_expires_at": sa.DateTime(timezone=True),
        "soundcloud_recent_tracks": sa.String(),
        "soundcloud_current_track": sa.String(),
        "soundcloud_track_started_at": sa.DateTime(timezone=True),
    }
    for name, column_type in additions.items():
        if name not in columns:
            op.add_column(
                "user_integrations",
                sa.Column(name, column_type, nullable=True),
            )

    flags = sa.table(
        "feature_flags",
        sa.column("key", sa.String),
        sa.column("description", sa.String),
        sa.column("is_enabled", sa.Boolean),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    key = "integration_soundcloud"
    exists = op.get_bind().execute(
        sa.select(flags.c.key).where(flags.c.key == key)
    ).first()
    if not exists:
        op.bulk_insert(flags, [{
            "key": key,
            "description": "SoundCloud: подключения и облачный скробблинг",
            "is_enabled": True,
            "updated_at": datetime.now(UTC),
        }])


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM feature_flags WHERE key = :key"),
        {"key": "integration_soundcloud"},
    )
    for name in (
        "soundcloud_track_started_at",
        "soundcloud_current_track",
        "soundcloud_recent_tracks",
        "soundcloud_token_expires_at",
        "soundcloud_refresh_token",
        "soundcloud_access_token",
    ):
        op.drop_column("user_integrations", name)
