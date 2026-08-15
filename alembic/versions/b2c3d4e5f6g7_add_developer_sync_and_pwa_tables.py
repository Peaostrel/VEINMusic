"""add_developer_sync_and_pwa_tables

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-15 13:30:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6g7'
down_revision: str | Sequence[str] | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_ID_FK = 'users.id'


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create api_keys table
    op.create_table(
        'api_keys',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('key_hash', sa.String(), nullable=True),
        sa.Column('prefix', sa.String(), nullable=True),
        sa.Column('name', sa.String(), server_default='Default API Key', nullable=True),
        sa.Column('scopes', sa.String(), server_default='scrobble:write,profile:read', nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], [USERS_ID_FK], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_api_keys_id'), 'api_keys', ['id'], unique=False)
    op.create_index(op.f('ix_api_keys_key_hash'), 'api_keys', ['key_hash'], unique=True)
    op.create_index(op.f('ix_api_keys_prefix'), 'api_keys', ['prefix'], unique=False)
    op.create_index(op.f('ix_api_keys_user_id'), 'api_keys', ['user_id'], unique=False)

    # 2. Create webhooks table
    op.create_table(
        'webhooks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('secret', sa.String(), nullable=False),
        sa.Column('events', sa.String(), server_default='scrobble.created,achievement.unlocked', nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], [USERS_ID_FK], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_webhooks_id'), 'webhooks', ['id'], unique=False)
    op.create_index(op.f('ix_webhooks_user_id'), 'webhooks', ['user_id'], unique=False)

    # 3. Create external_sync_configs table
    op.create_table(
        'external_sync_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('lastfm_session_key', sa.String(), nullable=True),
        sa.Column('listenbrainz_token', sa.String(), nullable=True),
        sa.Column('librefm_session_key', sa.String(), nullable=True),
        sa.Column('is_lastfm_enabled', sa.Boolean(), server_default=sa.text('false'), nullable=True),
        sa.Column('is_listenbrainz_enabled', sa.Boolean(), server_default=sa.text('false'), nullable=True),
        sa.Column('is_librefm_enabled', sa.Boolean(), server_default=sa.text('false'), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], [USERS_ID_FK], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_external_sync_configs_id'), 'external_sync_configs', ['id'], unique=False)
    op.create_index(op.f('ix_external_sync_configs_user_id'), 'external_sync_configs', ['user_id'], unique=True)

    # 4. Create blacklist_filters table
    op.create_table(
        'blacklist_filters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('pattern', sa.String(), nullable=False),
        sa.Column('filter_type', sa.String(), server_default='keyword', nullable=True),
        sa.Column('reason', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_blacklist_filters_id'), 'blacklist_filters', ['id'], unique=False)
    op.create_index(op.f('ix_blacklist_filters_pattern'), 'blacklist_filters', ['pattern'], unique=False)

    # 5. Create lastfm_import_jobs table
    op.create_table(
        'lastfm_import_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('lastfm_username', sa.String(), nullable=False),
        sa.Column('status', sa.String(), server_default='pending', nullable=True),
        sa.Column('progress', sa.Integer(), server_default='0', nullable=True),
        sa.Column('total_tracks', sa.Integer(), server_default='0', nullable=True),
        sa.Column('imported_tracks', sa.Integer(), server_default='0', nullable=True),
        sa.Column('error_log', sa.String(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], [USERS_ID_FK], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_lastfm_import_jobs_id'), 'lastfm_import_jobs', ['id'], unique=False)
    op.create_index(op.f('ix_lastfm_import_jobs_user_id'), 'lastfm_import_jobs', ['user_id'], unique=False)

    # 6. Create push_subscriptions table
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('endpoint', sa.String(), nullable=False),
        sa.Column('p256dh', sa.String(), nullable=False),
        sa.Column('auth', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], [USERS_ID_FK], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_push_subscriptions_id'), 'push_subscriptions', ['id'], unique=False)
    op.create_index(op.f('ix_push_subscriptions_user_id'), 'push_subscriptions', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('push_subscriptions')
    op.drop_table('lastfm_import_jobs')
    op.drop_table('blacklist_filters')
    op.drop_table('external_sync_configs')
    op.drop_table('webhooks')
    op.drop_table('api_keys')
