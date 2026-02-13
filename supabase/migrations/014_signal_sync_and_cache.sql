-- Migration: 014_signal_sync_and_cache
-- Description: Proper relational tables for signal sync (PostHog cohorts, Attio lists)
--              and PostHog event definition caching. Replaces JSONB-based approach with
--              typed columns, enums, FKs, and CHECK constraints.
-- Created: 2026-02-08

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE condition_operator_type AS ENUM ('gte', 'gt', 'eq', 'lt', 'lte');
CREATE TYPE sync_target_type AS ENUM ('posthog_cohort', 'attio_list');

-- ============================================
-- SIGNAL SYNC: Sync Configurations
-- Stores the query parameters for a signal that can be auto-synced.
-- 1:1 with a signal row (UNIQUE on signal_id).
-- ============================================

CREATE TABLE signal_sync_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Query parameters (typed columns, no JSONB)
    event_names TEXT[] NOT NULL,
    condition_operator condition_operator_type NOT NULL DEFAULT 'gte',
    condition_value INTEGER NOT NULL DEFAULT 1
        CHECK (condition_value > 0 AND condition_value <= 10000),
    time_window_days INTEGER NOT NULL DEFAULT 7
        CHECK (time_window_days >= 1 AND time_window_days <= 365),

    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(signal_id)
);

CREATE INDEX idx_signal_sync_configs_workspace ON signal_sync_configs(workspace_id);

-- ============================================
-- SIGNAL SYNC: Sync Targets
-- Each row is a sync destination (PostHog cohort or Attio list).
-- Many-to-one with signal_sync_configs.
-- ============================================

CREATE TABLE signal_sync_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_config_id UUID NOT NULL REFERENCES signal_sync_configs(id) ON DELETE CASCADE,

    target_type sync_target_type NOT NULL,
    external_id TEXT NOT NULL,           -- cohort ID (number as text) or Attio list UUID
    external_name TEXT,                  -- human-readable name
    auto_update BOOLEAN NOT NULL DEFAULT false,
    last_synced_at TIMESTAMPTZ,
    sync_error TEXT,                     -- last error message if sync failed

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signal_sync_targets_config ON signal_sync_targets(sync_config_id);
-- Partial index for the cron job: find all auto-update targets efficiently
CREATE INDEX idx_signal_sync_targets_auto_update
    ON signal_sync_targets(auto_update)
    WHERE auto_update = true;

-- ============================================
-- CACHE: PostHog Event Definitions
-- Replaces config_json caching with a proper table.
-- 15-minute TTL checked via cached_at column.
-- ============================================

CREATE TABLE cached_posthog_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    event_name TEXT NOT NULL,
    volume_30_day INTEGER DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT false,

    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(workspace_id, event_name)
);

CREATE INDEX idx_cached_posthog_events_workspace ON cached_posthog_events(workspace_id);
CREATE INDEX idx_cached_posthog_events_cached_at ON cached_posthog_events(cached_at);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_signal_sync_configs_updated_at
    BEFORE UPDATE ON signal_sync_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signal_sync_targets_updated_at
    BEFORE UPDATE ON signal_sync_targets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS: Enable and add policies
-- ============================================

ALTER TABLE signal_sync_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_sync_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cached_posthog_events ENABLE ROW LEVEL SECURITY;

-- signal_sync_configs: workspace-scoped
CREATE POLICY "Users can view their sync configs"
    ON signal_sync_configs FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can insert sync configs"
    ON signal_sync_configs FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can update their sync configs"
    ON signal_sync_configs FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can delete their sync configs"
    ON signal_sync_configs FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- signal_sync_targets: access via join through sync_config
CREATE POLICY "Users can view their sync targets"
    ON signal_sync_targets FOR SELECT
    USING (sync_config_id IN (
        SELECT id FROM signal_sync_configs
        WHERE workspace_id IN (SELECT get_user_workspaces())
    ));

CREATE POLICY "Users can insert sync targets"
    ON signal_sync_targets FOR INSERT
    WITH CHECK (sync_config_id IN (
        SELECT id FROM signal_sync_configs
        WHERE workspace_id IN (SELECT get_user_workspaces())
    ));

CREATE POLICY "Users can update their sync targets"
    ON signal_sync_targets FOR UPDATE
    USING (sync_config_id IN (
        SELECT id FROM signal_sync_configs
        WHERE workspace_id IN (SELECT get_user_workspaces())
    ));

CREATE POLICY "Users can delete their sync targets"
    ON signal_sync_targets FOR DELETE
    USING (sync_config_id IN (
        SELECT id FROM signal_sync_configs
        WHERE workspace_id IN (SELECT get_user_workspaces())
    ));

-- cached_posthog_events: workspace-scoped
CREATE POLICY "Users can view cached events"
    ON cached_posthog_events FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage cached events"
    ON cached_posthog_events FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));
