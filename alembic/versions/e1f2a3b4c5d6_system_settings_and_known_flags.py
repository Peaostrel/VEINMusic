"""System settings table; seed the feature flags the app checks

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-09-27 10:00:00.000000

"""
from datetime import UTC, datetime
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: str | Sequence[str] | None = 'd0e1f2a3b4c5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Kept in sync with app.services.runtime_settings.KNOWN_FEATURES
KNOWN_FEATURES = {
    "registration": "Регистрация новых аккаунтов",
    "listen_together": "Комнаты «Слушать вместе»",
    "lastfm_import": "Импорт истории из Last.fm",
    "webhooks": "Создание и отправка вебхуков",
}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "system_settings" not in insp.get_table_names():
        op.create_table(
            "system_settings",
            sa.Column("key", sa.String(length=64), primary_key=True),
            sa.Column("value", sa.String(length=256), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    flags = sa.table(
        "feature_flags",
        sa.column("key", sa.String),
        sa.column("description", sa.String),
        sa.column("is_enabled", sa.Boolean),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    existing = {row[0] for row in bind.execute(sa.select(flags.c.key))}
    now = datetime.now(UTC)
    missing = [
        {"key": key, "description": description, "is_enabled": True, "updated_at": now}
        for key, description in KNOWN_FEATURES.items() if key not in existing
    ]
    if missing:
        op.bulk_insert(flags, missing)


def downgrade() -> None:
    op.drop_table("system_settings")
