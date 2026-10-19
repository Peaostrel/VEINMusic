"""Add ordering to the profile achievement showcase.

Revision ID: a1b2c3d4e5f7
Revises: f8a9b0c1d2e3
"""

import sqlalchemy as sa

from alembic import op

revision = "a1b2c3d4e5f7"
down_revision = "f8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_achievements", sa.Column("display_order", sa.Integer(), nullable=True))
    showcase = sa.table(
        "user_achievements",
        sa.column("id", sa.Integer()),
        sa.column("user_id", sa.Integer()),
        sa.column("is_displayed", sa.Boolean()),
        sa.column("display_order", sa.Integer()),
    )
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(showcase.c.id, showcase.c.user_id)
        .where(showcase.c.is_displayed.is_(True))
        .order_by(showcase.c.user_id, showcase.c.id)
    ).all()
    positions: dict[int, int] = {}
    for row_id, user_id in rows:
        position = positions.get(user_id, 0)
        connection.execute(
            showcase.update().where(showcase.c.id == row_id).values(
                is_displayed=position < 6,
                display_order=position if position < 6 else None,
            )
        )
        positions[user_id] = position + 1


def downgrade() -> None:
    op.drop_column("user_achievements", "display_order")
