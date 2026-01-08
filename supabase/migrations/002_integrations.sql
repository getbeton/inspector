-- Migration: 002_integrations
-- Description: Integration configurations and settings tables
-- Created: 2025-01-08

-- ============================================
-- INTEGRATIONS: Integration Configs
-- Stores API keys and configuration for integrations
-- ============================================

CREATE TABLE integration_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    integration_name VARCHAR(50) NOT NULL,  -- "posthog", "attio", "stripe", "apollo"
    api_key_encrypted TEXT NOT NULL,  -- Encrypted API key (will migrate to Vault)
    config_json JSONB DEFAULT '{}',  -- {"project_id": "123", "host": "...", "workspace_id": "..."}
    status integration_status DEFAULT 'disconnected',
    last_validated_at TIMESTAMPTZ,  -- Last successful connection test
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique integration name per workspace
    UNIQUE (workspace_id, integration_name)
);

CREATE INDEX idx_integration_configs_workspace_id ON integration_configs(workspace_id);
CREATE INDEX idx_integration_configs_name ON integration_configs(integration_name);

-- ============================================
-- INTEGRATIONS: PostHog Workspace Config
-- PostHog-specific workspace configuration
-- ============================================

CREATE TABLE posthog_workspace_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,

    -- PostHog credentials
    posthog_api_key TEXT NOT NULL,  -- Encrypted
    posthog_workspace_name VARCHAR(255),
    posthog_project_id VARCHAR(255) NOT NULL,

    -- Validation state
    is_validated BOOLEAN DEFAULT FALSE,
    validated_at TIMESTAMPTZ,
    validation_error TEXT,

    -- Sync state
    last_sync TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posthog_config_workspace_id ON posthog_workspace_config(workspace_id);
CREATE INDEX idx_posthog_config_is_validated ON posthog_workspace_config(is_validated);

-- ============================================
-- SETTINGS: System Settings
-- Key-value store for system-wide settings
-- ============================================

CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,  -- JSON-encoded value
    description VARCHAR(500),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, key)
);

CREATE INDEX idx_system_settings_workspace_id ON system_settings(workspace_id);
CREATE INDEX idx_system_settings_key ON system_settings(key);

-- ============================================
-- SYNC: Sync State
-- Tracks sync progress for each integration
-- ============================================

CREATE TABLE sync_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    integration_name VARCHAR(50) NOT NULL,  -- "posthog", "attio", etc.
    last_sync_started_at TIMESTAMPTZ,
    last_sync_completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'idle',  -- "idle", "in_progress", "success", "failed"
    records_processed INTEGER DEFAULT 0,
    records_succeeded INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    cursor_data JSONB DEFAULT '{}',  -- {"last_signal_id": 123, "last_timestamp": "..."}
    error_summary TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, integration_name)
);

CREATE INDEX idx_sync_states_workspace_id ON sync_states(workspace_id);
CREATE INDEX idx_sync_states_integration ON sync_states(integration_name);

-- ============================================
-- RATE LIMITING: Query Tracking
-- Tracks API query counts for rate limiting
-- ============================================

CREATE TABLE rate_limit_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    integration_name VARCHAR(50) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,  -- Start of the hour window
    query_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_workspace_id ON rate_limit_tracking(workspace_id);
CREATE INDEX idx_rate_limit_integration_window ON rate_limit_tracking(integration_name, window_start);

-- ============================================
-- CACHING: Query Cache
-- Caches HogQL query results to reduce API calls
-- ============================================

CREATE TABLE query_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    cache_key VARCHAR(64) NOT NULL,  -- SHA256 hash of normalized query
    query_hash VARCHAR(64) NOT NULL,  -- Hash of the original query
    result_json TEXT NOT NULL,  -- JSON-encoded query result
    result_size_bytes INTEGER DEFAULT 0,
    hit_count INTEGER DEFAULT 0,
    ttl_seconds INTEGER DEFAULT 3600,
    expires_at TIMESTAMPTZ NOT NULL,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, cache_key)
);

CREATE INDEX idx_query_cache_workspace_id ON query_cache(workspace_id);
CREATE INDEX idx_query_cache_key ON query_cache(cache_key);
CREATE INDEX idx_query_cache_expires ON query_cache(expires_at);

-- ============================================
-- ATTIO: Field Mappings
-- Maps Beton fields to Attio attributes
-- ============================================

CREATE TABLE attio_field_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    attio_object_slug VARCHAR(100) NOT NULL,  -- "companies", "people"
    beton_field VARCHAR(100) NOT NULL,  -- "beton_score", "beton_signal"
    attio_attribute_id VARCHAR(255),
    attio_attribute_slug VARCHAR(100),
    attio_attribute_type VARCHAR(50),  -- "number", "text", "timestamp"
    is_auto_created BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, attio_object_slug, beton_field)
);

CREATE INDEX idx_attio_field_mappings_workspace_id ON attio_field_mappings(workspace_id);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_integration_configs_updated_at
    BEFORE UPDATE ON integration_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posthog_workspace_config_updated_at
    BEFORE UPDATE ON posthog_workspace_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_states_updated_at
    BEFORE UPDATE ON sync_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limit_tracking_updated_at
    BEFORE UPDATE ON rate_limit_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attio_field_mappings_updated_at
    BEFORE UPDATE ON attio_field_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
