"""add authentication and multitenancy tables

Revision ID: 4d1a2b3c4d5e
Revises: 3c9d56f82e10
Create Date: 2025-01-15 10:00:00.000000

Epic 1: Database Schema & RLS
- Creates workspaces table for multi-tenant isolation
- Creates workspace_members for team collaboration
- Creates vault_secrets for encrypted credentials
- Creates tracked_identities for billing accuracy
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '4d1a2b3c4d5e'
down_revision = '3c9d56f82e10'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create workspaces table
    op.create_table(
        'workspaces',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False),
        sa.Column('stripe_customer_id', sa.String(255), nullable=True),
        sa.Column('stripe_subscription_id', sa.String(255), nullable=True),
        sa.Column('subscription_status', sa.String(50), nullable=False, server_default='active'),
        sa.Column('billing_cycle_start', sa.DateTime(), nullable=True),
        sa.Column('next_billing_date', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
        sa.UniqueConstraint('stripe_customer_id'),
    )
    op.create_index(op.f('ix_workspaces_slug'), 'workspaces', ['slug'], unique=True)

    # Create workspace_members table (many-to-many: workspaces <-> users)
    op.create_table(
        'workspace_members',
        sa.Column('workspace_id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False),
        sa.Column('role', sa.String(50), nullable=False, server_default='member'),
        sa.Column('joined_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('workspace_id', 'user_id'),
    )
    op.create_index(op.f('ix_workspace_members_workspace_id'), 'workspace_members', ['workspace_id'])
    op.create_index(op.f('ix_workspace_members_user_id'), 'workspace_members', ['user_id'])

    # Create vault_secrets table (encrypted credentials)
    op.create_table(
        'vault_secrets',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('workspace_id', sa.String(36), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('secret', sa.Text(), nullable=False),
        sa.Column('secret_metadata', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vault_secrets_workspace_id'), 'vault_secrets', ['workspace_id'])
    op.create_index(
        'ix_vault_secrets_workspace_name',
        'vault_secrets',
        ['workspace_id', 'name'],
        unique=True
    )

    # Create tracked_identities table (for billing)
    op.create_table(
        'tracked_identities',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('workspace_id', sa.String(36), nullable=False),
        sa.Column('person_id', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('last_seen_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_tracked_identities_workspace_id'), 'tracked_identities', ['workspace_id'])
    op.create_index(
        'ix_tracked_identities_workspace_person',
        'tracked_identities',
        ['workspace_id', 'person_id'],
        unique=True
    )
    op.create_index(
        'ix_tracked_identities_workspace_active',
        'tracked_identities',
        ['workspace_id', 'is_active']
    )


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign keys)
    op.drop_index(op.f('ix_tracked_identities_workspace_active'), table_name='tracked_identities')
    op.drop_index(op.f('ix_tracked_identities_workspace_person'), table_name='tracked_identities')
    op.drop_index(op.f('ix_tracked_identities_workspace_id'), table_name='tracked_identities')
    op.drop_table('tracked_identities')

    op.drop_index(op.f('ix_vault_secrets_workspace_name'), table_name='vault_secrets')
    op.drop_index(op.f('ix_vault_secrets_workspace_id'), table_name='vault_secrets')
    op.drop_table('vault_secrets')

    op.drop_index(op.f('ix_workspace_members_user_id'), table_name='workspace_members')
    op.drop_index(op.f('ix_workspace_members_workspace_id'), table_name='workspace_members')
    op.drop_table('workspace_members')

    op.drop_index(op.f('ix_workspaces_slug'), table_name='workspaces')
    op.drop_table('workspaces')
