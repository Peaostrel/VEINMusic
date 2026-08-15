"""add_admin_and_platform_tables

Revision ID: a1b2c3d4e5f6
Revises: 756d4efbbf12
Create Date: 2026-08-14 23:05:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: str | Sequence[str] | None = '756d4efbbf12'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add antifraud / moderation columns to users
    op.add_column('users', sa.Column('is_banned', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('users', sa.Column('is_flagged_antifraud', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('users', sa.Column('antifraud_reason', sa.String(), nullable=True))

    # Create avatar_frames table
    op.create_table(
        'avatar_frames',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('css_style', sa.String(), nullable=True),
        sa.Column('image_url', sa.String(), nullable=True),
        sa.Column('rarity', sa.String(), server_default='common', nullable=True),
        sa.Column('required_level', sa.Integer(), server_default='1', nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_avatar_frames_id'), 'avatar_frames', ['id'], unique=False)
    op.create_index(op.f('ix_avatar_frames_code'), 'avatar_frames', ['code'], unique=True)

    # Create system_announcements table
    op.create_table(
        'system_announcements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.String(), nullable=False),
        sa.Column('type', sa.String(), server_default='info', nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_system_announcements_id'), 'system_announcements', ['id'], unique=False)

    # Create feature_flags table
    op.create_table(
        'feature_flags',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_feature_flags_id'), 'feature_flags', ['id'], unique=False)
    op.create_index(op.f('ix_feature_flags_key'), 'feature_flags', ['key'], unique=True)

    # Create track_aliases table
    op.create_table(
        'track_aliases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('original_title', sa.String(), nullable=True),
        sa.Column('original_artist', sa.String(), nullable=True),
        sa.Column('canonical_track_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['canonical_track_id'], ['tracks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_track_aliases_id'), 'track_aliases', ['id'], unique=False)
    op.create_index(op.f('ix_track_aliases_original_title'), 'track_aliases', ['original_title'], unique=False)
    op.create_index(op.f('ix_track_aliases_original_artist'), 'track_aliases', ['original_artist'], unique=False)
    op.create_index(op.f('ix_track_aliases_canonical_track_id'), 'track_aliases', ['canonical_track_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_track_aliases_canonical_track_id'), table_name='track_aliases')
    op.drop_index(op.f('ix_track_aliases_original_artist'), table_name='track_aliases')
    op.drop_index(op.f('ix_track_aliases_original_title'), table_name='track_aliases')
    op.drop_index(op.f('ix_track_aliases_id'), table_name='track_aliases')
    op.drop_table('track_aliases')

    op.drop_index(op.f('ix_feature_flags_key'), table_name='feature_flags')
    op.drop_index(op.f('ix_feature_flags_id'), table_name='feature_flags')
    op.drop_table('feature_flags')

    op.drop_index(op.f('ix_system_announcements_id'), table_name='system_announcements')
    op.drop_table('system_announcements')

    op.drop_index(op.f('ix_avatar_frames_code'), table_name='avatar_frames')
    op.drop_index(op.f('ix_avatar_frames_id'), table_name='avatar_frames')
    op.drop_table('avatar_frames')

    op.drop_column('users', 'antifraud_reason')
    op.drop_column('users', 'is_flagged_antifraud')
    op.drop_column('users', 'is_banned')
