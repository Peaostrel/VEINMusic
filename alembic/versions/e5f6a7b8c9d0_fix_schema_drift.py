"""Fix drift between models and migrations

Adds user_integrations.has_imported_lastfm and the unique constraint on
push_subscriptions.endpoint, which existed in the models but not in the
migrations (databases created only via `alembic upgrade` were missing them).

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-26 10:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: str | Sequence[str] | None = 'd4e5f6a7b8c9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PUSH_ENDPOINT_UQ = "uq_push_subscriptions_endpoint"


def _has_column(table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def _has_unique_on(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    uniques = [u["column_names"] for u in insp.get_unique_constraints(table)]
    uniques += [i["column_names"] for i in insp.get_indexes(table) if i.get("unique")]
    return [column] in uniques


def upgrade() -> None:
    # Databases originally created with Base.metadata.create_all() may
    # already have these, so every step is conditional.
    if not _has_column("user_integrations", "has_imported_lastfm"):
        op.add_column(
            "user_integrations",
            sa.Column("has_imported_lastfm", sa.Boolean(), nullable=True, server_default=sa.text("false")),
        )

    if not _has_unique_on("push_subscriptions", "endpoint"):
        op.execute(
            "DELETE FROM push_subscriptions WHERE id NOT IN ("
            "SELECT keep_id FROM (SELECT MAX(id) AS keep_id FROM push_subscriptions "
            "GROUP BY endpoint) AS keep_rows)"
        )
        op.create_unique_constraint(_PUSH_ENDPOINT_UQ, "push_subscriptions", ["endpoint"])


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if _PUSH_ENDPOINT_UQ in {u["name"] for u in insp.get_unique_constraints("push_subscriptions")}:
        op.drop_constraint(_PUSH_ENDPOINT_UQ, "push_subscriptions", type_="unique")
    # has_imported_lastfm is intentionally kept: older app versions use it too.
