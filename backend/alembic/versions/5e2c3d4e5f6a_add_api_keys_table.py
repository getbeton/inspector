"""add api_keys table for API key authentication

Revision ID: 5e2c3d4e5f6a
Revises: 4d1a2b3c4d5e
Create Date: 2025-12-25 10:00:00.000000

Simplification: Replace JWT with API key authentication
- Creates api_keys table for simple key-based auth
- Keys are hashed with bcrypt, only hash stored in DB
- One key per user/workspace
- Keys expire after 90 days
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5e2c3d4e5f6a'
down_revision = '4d1a2b3c4d5e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create api_keys table
    op.create_table(
        'api_keys',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('workspace_id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(255), nullable=False),
        sa.Column('key_hash', sa.String(255), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key_hash', name='uq_api_keys_key_hash'),
        sa.UniqueConstraint('workspace_id', name='uq_api_keys_one_per_workspace'),
    )

    # Indexes for fast lookups
    op.create_index(op.f('ix_api_keys_workspace_id'), 'api_keys', ['workspace_id'])
    op.create_index(op.f('ix_api_keys_created_at'), 'api_keys', ['created_at'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_api_keys_created_at'), table_name='api_keys')
    op.drop_index(op.f('ix_api_keys_workspace_id'), table_name='api_keys')

    # Drop table
    op.drop_table('api_keys')
