-- Migration: 025_data_sources
-- Description: Data sources table — multi-instance, workspace-scoped storage
--   for external database connections (initially Postgres). Separate from
--   integration_configs to support N connections per workspace per source type.
-- Created: 2026-03-30

-- ============================================
-- TABLE: data_sources
-- Workspace-scoped external database connections.
-- Supports multiple connections per workspace, each with a unique name.
-- ============================================

CREATE TABLE data_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Identity
    source_type TEXT NOT NULL,                -- 'postgres' (extensible to 'mysql', 'bigquery', etc.)
    name TEXT NOT NULL,                       -- User-friendly alias, e.g. "Production DB"

    -- Connection fields (stored separately for individual editing)
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 5432,
    database_name TEXT NOT NULL,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,         -- AES-256-GCM via existing encrypt()
    ssl_mode TEXT NOT NULL DEFAULT 'require', -- 'require', 'prefer', 'disable', 'verify-ca', 'verify-full'

    -- Extra config (future: schema filters, read replica flag, etc.)
    config_json JSONB NOT NULL DEFAULT '{}',

    -- Status
    status TEXT NOT NULL DEFAULT 'pending',   -- 'pending', 'connected', 'error', 'disconnected'
    last_validated_at TIMESTAMPTZ,
    last_error TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A workspace cannot have two data sources with the same name
    CONSTRAINT data_sources_workspace_name_unique UNIQUE (workspace_id, name)
);

-- ============================================
-- INDEXES
-- Primary lookup: by workspace (list all sources for a workspace)
-- Secondary: by workspace + type (list all Postgres sources)
-- ============================================

CREATE INDEX idx_data_sources_workspace ON data_sources(workspace_id);
CREATE INDEX idx_data_sources_workspace_type ON data_sources(workspace_id, source_type);

-- ============================================
-- RLS: Workspace members can view and manage their data sources
-- ============================================

ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workspace data sources"
    ON data_sources FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace data sources"
    ON data_sources FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_data_sources_updated_at
    BEFORE UPDATE ON data_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS: Document encrypted columns
-- ============================================

COMMENT ON COLUMN data_sources.password_encrypted IS 'AES-256-GCM encrypted database password (format: salt:iv:tag:ciphertext)';
COMMENT ON TABLE data_sources IS 'External database connections, workspace-scoped with multi-instance support. Password encrypted via AES-256-GCM.';

-- ============================================
-- SEED: Add postgres to integration_definitions registry
-- This drives the setup wizard and settings page.
-- ============================================

INSERT INTO integration_definitions (
    name, display_name, description, category,
    icon_url, icon_url_light,
    required, display_order, setup_step_key,
    supports_self_hosted, config_schema
)
VALUES (
    'postgres',
    'PostgreSQL',
    'Connect directly to a PostgreSQL database for analytics and data exploration',
    'data_source',
    'https://cdn.brandfetch.io/idD6M_K1dV/theme/dark/symbol.svg',
    'https://cdn.brandfetch.io/idD6M_K1dV/theme/light/symbol.svg',
    false,           -- Not required (PostHog is the primary required data source)
    15,              -- After PostHog (10), before Attio (20)
    'postgres',      -- Maps to wizard step component
    false,           -- No cloud/self-hosted distinction — it is always the user's own DB
    '{"type": "object", "properties": {"host": {"type": "string"}, "port": {"type": "integer", "default": 5432}, "database": {"type": "string"}, "ssl_mode": {"type": "string", "enum": ["require", "prefer", "disable", "verify-ca", "verify-full"]}}, "description": "PostgreSQL connection settings"}'::jsonb
);
