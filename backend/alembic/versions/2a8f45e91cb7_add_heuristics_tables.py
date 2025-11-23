"""add_heuristics_tables

Revision ID: 2a8f45e91cb7
Revises: 17b72696978f
Create Date: 2025-11-23 17:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2a8f45e91cb7'
down_revision = '17b72696978f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to accounts table
    op.add_column('accounts', sa.Column('fit_score', sa.Float(), nullable=True, server_default='0.0'))
    op.add_column('accounts', sa.Column('last_activity_at', sa.DateTime(), nullable=True))
    
    # Create metric_snapshots table
    op.create_table('metric_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('metric_name', sa.String(), nullable=False),
        sa.Column('metric_value', sa.Float(), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_metric_snapshots_id'), 'metric_snapshots', ['id'], unique=False)
    op.create_index(op.f('ix_metric_snapshots_account_id'), 'metric_snapshots', ['account_id'], unique=False)
    op.create_index(op.f('ix_metric_snapshots_metric_name'), 'metric_snapshots', ['metric_name'], unique=False)
    op.create_index(op.f('ix_metric_snapshots_snapshot_date'), 'metric_snapshots', ['snapshot_date'], unique=False)
    
    # Create heuristic_scores table
    op.create_table('heuristic_scores',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('score_type', sa.String(), nullable=False),
        sa.Column('score_value', sa.Float(), nullable=False),
        sa.Column('component_scores', sa.JSON(), nullable=True),
        sa.Column('calculated_at', sa.DateTime(), nullable=True),
        sa.Column('valid_until', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_heuristic_scores_id'), 'heuristic_scores', ['id'], unique=False)
    op.create_index(op.f('ix_heuristic_scores_account_id'), 'heuristic_scores', ['account_id'], unique=False)
    op.create_index(op.f('ix_heuristic_scores_score_type'), 'heuristic_scores', ['score_type'], unique=False)
    
    # Create account_clusters table
    op.create_table('account_clusters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('cluster_id', sa.Integer(), nullable=False),
        sa.Column('cluster_label', sa.String(), nullable=True),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('features', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_account_clusters_id'), 'account_clusters', ['id'], unique=False)
    op.create_index(op.f('ix_account_clusters_account_id'), 'account_clusters', ['account_id'], unique=False)
    op.create_index(op.f('ix_account_clusters_cluster_id'), 'account_clusters', ['cluster_id'], unique=False)


def downgrade() -> None:
    # Drop account_clusters table
    op.drop_index(op.f('ix_account_clusters_cluster_id'), table_name='account_clusters')
    op.drop_index(op.f('ix_account_clusters_account_id'), table_name='account_clusters')
    op.drop_index(op.f('ix_account_clusters_id'), table_name='account_clusters')
    op.drop_table('account_clusters')
    
    # Drop heuristic_scores table
    op.drop_index(op.f('ix_heuristic_scores_score_type'), table_name='heuristic_scores')
    op.drop_index(op.f('ix_heuristic_scores_account_id'), table_name='heuristic_scores')
    op.drop_index(op.f('ix_heuristic_scores_id'), table_name='heuristic_scores')
    op.drop_table('heuristic_scores')
    
    # Drop metric_snapshots table
    op.drop_index(op.f('ix_metric_snapshots_snapshot_date'), table_name='metric_snapshots')
    op.drop_index(op.f('ix_metric_snapshots_metric_name'), table_name='metric_snapshots')
    op.drop_index(op.f('ix_metric_snapshots_account_id'), table_name='metric_snapshots')
    op.drop_index(op.f('ix_metric_snapshots_id'), table_name='metric_snapshots')
    op.drop_table('metric_snapshots')
    
    # Remove columns from accounts table
    op.drop_column('accounts', 'last_activity_at')
    op.drop_column('accounts', 'fit_score')
