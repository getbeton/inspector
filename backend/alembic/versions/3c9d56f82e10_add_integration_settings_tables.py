"""add_integration_settings_tables

Revision ID: 3c9d56f82e10
Revises: 2a8f45e91cb7
Create Date: 2025-12-25 10:00:00.000000

This migration adds tables for:
- Integration configuration (PostHog, Attio, etc.)
- System settings
- Sync state tracking
- Rate limit tracking
- Query caching
- Dashboard registry
- Attio field mappings
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3c9d56f82e10'
down_revision = '2a8f45e91cb7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ============================================
    # Phase 1: Settings & Configuration Tables
    # ============================================

    # Create integration_configs table
    op.create_table('integration_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('integration_name', sa.String(50), nullable=False),
        sa.Column('api_key_encrypted', sa.Text(), nullable=False),
        sa.Column('config_json', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('status', sa.String(20), nullable=True, server_default='disconnected'),
        sa.Column('last_validated_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_integration_configs_id'), 'integration_configs', ['id'], unique=False)
    op.create_index(op.f('ix_integration_configs_integration_name'), 'integration_configs', ['integration_name'], unique=True)

    # Create system_settings table
    op.create_table('system_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_system_settings_id'), 'system_settings', ['id'], unique=False)
    op.create_index(op.f('ix_system_settings_key'), 'system_settings', ['key'], unique=True)

    # Create sync_states table
    op.create_table('sync_states',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('integration_name', sa.String(50), nullable=False),
        sa.Column('last_sync_started_at', sa.DateTime(), nullable=True),
        sa.Column('last_sync_completed_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(20), nullable=True, server_default='idle'),
        sa.Column('records_processed', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('records_succeeded', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('records_failed', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('cursor_data', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('error_summary', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sync_states_id'), 'sync_states', ['id'], unique=False)
    op.create_index(op.f('ix_sync_states_integration_name'), 'sync_states', ['integration_name'], unique=True)

    # ============================================
    # Phase 2: Rate Limiting & Caching Tables
    # ============================================

    # Create rate_limit_tracking table
    op.create_table('rate_limit_tracking',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('integration_name', sa.String(50), nullable=False),
        sa.Column('window_start', sa.DateTime(), nullable=False),
        sa.Column('query_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rate_limit_tracking_id'), 'rate_limit_tracking', ['id'], unique=False)
    op.create_index(op.f('ix_rate_limit_tracking_integration_name'), 'rate_limit_tracking', ['integration_name'], unique=False)
    op.create_index(op.f('ix_rate_limit_tracking_window_start'), 'rate_limit_tracking', ['window_start'], unique=False)
    op.create_index('ix_rate_limit_integration_window', 'rate_limit_tracking', ['integration_name', 'window_start'], unique=False)

    # Create query_cache table
    op.create_table('query_cache',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cache_key', sa.String(64), nullable=False),
        sa.Column('query_hash', sa.String(64), nullable=False),
        sa.Column('result_json', sa.Text(), nullable=False),
        sa.Column('result_size_bytes', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('hit_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('ttl_seconds', sa.Integer(), nullable=True, server_default='3600'),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('last_accessed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_query_cache_id'), 'query_cache', ['id'], unique=False)
    op.create_index(op.f('ix_query_cache_cache_key'), 'query_cache', ['cache_key'], unique=True)
    op.create_index(op.f('ix_query_cache_expires_at'), 'query_cache', ['expires_at'], unique=False)

    # ============================================
    # Phase 3: Attio Field Mapping Tables
    # ============================================

    # Create attio_field_mappings table
    op.create_table('attio_field_mappings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('attio_object_slug', sa.String(100), nullable=False),
        sa.Column('beton_field', sa.String(100), nullable=False),
        sa.Column('attio_attribute_id', sa.String(255), nullable=True),
        sa.Column('attio_attribute_slug', sa.String(100), nullable=True),
        sa.Column('attio_attribute_type', sa.String(50), nullable=True),
        sa.Column('is_auto_created', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_attio_field_mappings_id'), 'attio_field_mappings', ['id'], unique=False)
    op.create_index(op.f('ix_attio_field_mappings_attio_object_slug'), 'attio_field_mappings', ['attio_object_slug'], unique=False)
    op.create_index('ix_attio_mapping_object_field', 'attio_field_mappings', ['attio_object_slug', 'beton_field'], unique=True)

    # ============================================
    # Phase 4: Dashboard Registry Tables
    # ============================================

    # Create dashboard_registry table
    op.create_table('dashboard_registry',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('beton_dashboard_type', sa.String(100), nullable=False),
        sa.Column('posthog_dashboard_id', sa.String(255), nullable=False),
        sa.Column('posthog_dashboard_uuid', sa.String(255), nullable=True),
        sa.Column('posthog_dashboard_url', sa.Text(), nullable=True),
        sa.Column('folder_path', sa.String(255), nullable=True),
        sa.Column('schema_version', sa.String(20), nullable=True, server_default='1.0.0'),
        sa.Column('insights_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_dashboard_registry_id'), 'dashboard_registry', ['id'], unique=False)
    op.create_index(op.f('ix_dashboard_registry_beton_dashboard_type'), 'dashboard_registry', ['beton_dashboard_type'], unique=True)

    # Create insight_registry table
    op.create_table('insight_registry',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dashboard_id', sa.Integer(), nullable=True),
        sa.Column('beton_insight_type', sa.String(100), nullable=False),
        sa.Column('posthog_insight_id', sa.String(255), nullable=False),
        sa.Column('posthog_insight_uuid', sa.String(255), nullable=True),
        sa.Column('query_hash', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['dashboard_id'], ['dashboard_registry.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_insight_registry_id'), 'insight_registry', ['id'], unique=False)

    # ============================================
    # Stat Test Run & Signal Aggregates Tables
    # ============================================

    # Create stat_test_runs table
    op.create_table('stat_test_runs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('signal_id', sa.Integer(), nullable=True),
        sa.Column('test_name', sa.String(100), nullable=False),
        sa.Column('test_type', sa.String(50), nullable=False),
        sa.Column('parameters_json', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('status', sa.String(20), nullable=True, server_default='pending'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('results_json', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('precision', sa.Float(), nullable=True),
        sa.Column('recall', sa.Float(), nullable=True),
        sa.Column('f1_score', sa.Float(), nullable=True),
        sa.Column('lift', sa.Float(), nullable=True),
        sa.Column('conversion_rate', sa.Float(), nullable=True),
        sa.Column('sample_size', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['signal_id'], ['signals.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stat_test_runs_id'), 'stat_test_runs', ['id'], unique=False)
    op.create_index(op.f('ix_stat_test_runs_test_name'), 'stat_test_runs', ['test_name'], unique=False)

    # Create signal_aggregates table
    op.create_table('signal_aggregates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('signal_type', sa.String(100), nullable=False),
        sa.Column('total_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('count_last_7d', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('count_last_30d', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('avg_precision', sa.Float(), nullable=True),
        sa.Column('avg_recall', sa.Float(), nullable=True),
        sa.Column('avg_f1_score', sa.Float(), nullable=True),
        sa.Column('avg_lift', sa.Float(), nullable=True),
        sa.Column('avg_conversion_rate', sa.Float(), nullable=True),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('quality_grade', sa.String(5), nullable=True),
        sa.Column('total_arr_influenced', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('avg_deal_size', sa.Float(), nullable=True),
        sa.Column('win_rate', sa.Float(), nullable=True),
        sa.Column('avg_days_to_close', sa.Float(), nullable=True),
        sa.Column('last_calculated_at', sa.DateTime(), nullable=True),
        sa.Column('calculation_window_days', sa.Integer(), nullable=True, server_default='90'),
        sa.Column('sample_size', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_signal_aggregates_id'), 'signal_aggregates', ['id'], unique=False)
    op.create_index(op.f('ix_signal_aggregates_signal_type'), 'signal_aggregates', ['signal_type'], unique=True)

    # Create user_signal_preferences table
    op.create_table('user_signal_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('signal_type', sa.String(100), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('priority', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('custom_threshold', sa.Float(), nullable=True),
        sa.Column('notification_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('user_conversion_rate', sa.Float(), nullable=True),
        sa.Column('user_win_rate', sa.Float(), nullable=True),
        sa.Column('user_avg_response_time_hours', sa.Float(), nullable=True),
        sa.Column('signals_received_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('signals_acted_on_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('last_signal_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_signal_preferences_id'), 'user_signal_preferences', ['id'], unique=False)
    op.create_index(op.f('ix_user_signal_preferences_signal_type'), 'user_signal_preferences', ['signal_type'], unique=False)
    op.create_index('ix_user_signal_pref_user_signal', 'user_signal_preferences', ['user_id', 'signal_type'], unique=True)

    # ============================================
    # Insert default system settings
    # ============================================
    op.execute("""
        INSERT INTO system_settings (key, value, description, created_at, updated_at)
        VALUES
            ('query_budget_limit', '2000', 'Maximum PostHog queries per hour', NOW(), NOW()),
            ('cache_ttl_seconds', '3600', 'Default cache TTL in seconds', NOW(), NOW()),
            ('attio_batch_size', '100', 'Number of records to send in Attio batch', NOW(), NOW()),
            ('max_concurrent_requests', '5', 'Max concurrent API requests', NOW(), NOW())
    """)


def downgrade() -> None:
    # Drop tables in reverse order of creation

    # Stat Test Run & Signal Aggregates
    op.drop_index('ix_user_signal_pref_user_signal', table_name='user_signal_preferences')
    op.drop_index(op.f('ix_user_signal_preferences_signal_type'), table_name='user_signal_preferences')
    op.drop_index(op.f('ix_user_signal_preferences_id'), table_name='user_signal_preferences')
    op.drop_table('user_signal_preferences')

    op.drop_index(op.f('ix_signal_aggregates_signal_type'), table_name='signal_aggregates')
    op.drop_index(op.f('ix_signal_aggregates_id'), table_name='signal_aggregates')
    op.drop_table('signal_aggregates')

    op.drop_index(op.f('ix_stat_test_runs_test_name'), table_name='stat_test_runs')
    op.drop_index(op.f('ix_stat_test_runs_id'), table_name='stat_test_runs')
    op.drop_table('stat_test_runs')

    # Phase 4: Dashboard Registry
    op.drop_index(op.f('ix_insight_registry_id'), table_name='insight_registry')
    op.drop_table('insight_registry')

    op.drop_index(op.f('ix_dashboard_registry_beton_dashboard_type'), table_name='dashboard_registry')
    op.drop_index(op.f('ix_dashboard_registry_id'), table_name='dashboard_registry')
    op.drop_table('dashboard_registry')

    # Phase 3: Attio Field Mapping
    op.drop_index('ix_attio_mapping_object_field', table_name='attio_field_mappings')
    op.drop_index(op.f('ix_attio_field_mappings_attio_object_slug'), table_name='attio_field_mappings')
    op.drop_index(op.f('ix_attio_field_mappings_id'), table_name='attio_field_mappings')
    op.drop_table('attio_field_mappings')

    # Phase 2: Rate Limiting & Caching
    op.drop_index(op.f('ix_query_cache_expires_at'), table_name='query_cache')
    op.drop_index(op.f('ix_query_cache_cache_key'), table_name='query_cache')
    op.drop_index(op.f('ix_query_cache_id'), table_name='query_cache')
    op.drop_table('query_cache')

    op.drop_index('ix_rate_limit_integration_window', table_name='rate_limit_tracking')
    op.drop_index(op.f('ix_rate_limit_tracking_window_start'), table_name='rate_limit_tracking')
    op.drop_index(op.f('ix_rate_limit_tracking_integration_name'), table_name='rate_limit_tracking')
    op.drop_index(op.f('ix_rate_limit_tracking_id'), table_name='rate_limit_tracking')
    op.drop_table('rate_limit_tracking')

    # Phase 1: Settings & Configuration
    op.drop_index(op.f('ix_sync_states_integration_name'), table_name='sync_states')
    op.drop_index(op.f('ix_sync_states_id'), table_name='sync_states')
    op.drop_table('sync_states')

    op.drop_index(op.f('ix_system_settings_key'), table_name='system_settings')
    op.drop_index(op.f('ix_system_settings_id'), table_name='system_settings')
    op.drop_table('system_settings')

    op.drop_index(op.f('ix_integration_configs_integration_name'), table_name='integration_configs')
    op.drop_index(op.f('ix_integration_configs_id'), table_name='integration_configs')
    op.drop_table('integration_configs')
