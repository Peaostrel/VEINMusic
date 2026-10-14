"""Keep reports about a deleted account (target_user_id ON DELETE SET NULL)

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-10-15 12:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f8a9b0c1d2e3'
down_revision: str | Sequence[str] | None = 'e7f8a9b0c1d2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK_NAME = "fk_reports_target_user_id_users"


def _set_target_fk(ondelete: str) -> None:
    bind = op.get_bind()
    # SQLite can only change a constraint by copying the table, which drops
    # the ON DELETE rules of the other keys: development databases keep it
    if bind.dialect.name == "sqlite":
        return
    current = [fk for fk in sa.inspect(bind).get_foreign_keys("reports")
               if fk["constrained_columns"] == ["target_user_id"]]
    if current and (current[0].get("options") or {}).get("ondelete", "").upper() == ondelete:
        return
    for fk in current:
        op.drop_constraint(fk["name"], "reports", type_="foreignkey")
    op.create_foreign_key(FK_NAME, "reports", "users", ["target_user_id"], ["id"], ondelete=ondelete)


def upgrade() -> None:
    _set_target_fk("SET NULL")


def downgrade() -> None:
    op.execute("DELETE FROM reports WHERE target_user_id IS NULL AND target_type != 'track'")
    _set_target_fk("CASCADE")
