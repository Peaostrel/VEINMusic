"""Record the consent to personal data processing given at sign-up.

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f7
"""

import sqlalchemy as sa

from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pd_consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("pd_consent_version", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "pd_consent_version")
    op.drop_column("users", "pd_consent_at")
