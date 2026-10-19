"""Add ordering to the profile achievement showcase.

Revision ID: a1b2c3d4e5f7
Revises: f8a9b0c1d2e3
"""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f7"
down_revision = "f8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_achievements", sa.Column("display_order", sa.Integer(), nullable=True))
    op.execute("UPDATE user_achievements SET display_order = id WHERE is_displayed")


def downgrade() -> None:
    op.drop_column("user_achievements", "display_order")
