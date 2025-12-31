"""add posthog_workspace_config table

Revision ID: 6f7a8b9c0d1e
Revises: 5e2c3d4e5f6a
Create Date: 2025-12-31 21:30:00.000000

Epic 6 - Commit 1: Database Schema for PostHog Configuration
- Creates posthog_workspace_config table for storing PostHog API keys and settings
- One config per workspace (unique constraint on workspace_id)
- API key encrypted via Vault
- Tracks validation state and sync timestamps
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6f7a8b9c0d1e'
down_revision = '5e2c3d4e5f6a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create posthog_workspace_config table
    op.create_table(
        'posthog_workspace_config',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('workspace_id', sa.String(36), nullable=False),
        sa.Column('posthog_api_key', sa.Text(), nullable=False),
        sa.Column('posthog_workspace_name', sa.String(255), nullable=True),
        sa.Column('posthog_project_id', sa.String(255), nullable=False),
        sa.Column('is_validated', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('validated_at', sa.DateTime(), nullable=True),
        sa.Column('validation_error', sa.Text(), nullable=True),
        sa.Column('last_sync', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('workspace_id', name='uq_posthog_workspace_config_workspace_id'),
    )

    # Indexes for fast lookups
    op.create_index(
        'ix_posthog_workspace_config_workspace_id',
        'posthog_workspace_config',
        ['workspace_id']
    )
    op.create_index(
        'ix_posthog_workspace_config_is_validated',
        'posthog_workspace_config',
        ['is_validated']
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_posthog_workspace_config_is_validated', table_name='posthog_workspace_config')
    op.drop_index('ix_posthog_workspace_config_workspace_id', table_name='posthog_workspace_config')

    # Drop table
    op.drop_table('posthog_workspace_config')
