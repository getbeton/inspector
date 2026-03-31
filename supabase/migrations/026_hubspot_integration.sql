-- Migration: 026_hubspot_integration
-- Description: HubSpot CRM integration tables — OAuth/Private App connections,
--   sync state tracking, record cache, and association mapping.
--   Supports multiple connections per workspace.
-- Created: 2026-03-31

-- ============================================
-- TABLE: hubspot_connections
-- Workspace-scoped HubSpot CRM connections.
-- Supports OAuth and Private App Token auth types.
-- ============================================

CREATE TABLE hubspot_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Identity
    name TEXT NOT NULL DEFAULT 'HubSpot',                -- User-friendly alias
    auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth', 'private_app')),

    -- OAuth credentials (encrypted)
    access_token_encrypted TEXT,           -- AES-256-GCM encrypted
    refresh_token_encrypted TEXT,          -- AES-256-GCM encrypted
    token_expires_at TIMESTAMPTZ,

    -- Private App credentials (encrypted)
    private_app_token_encrypted TEXT,      -- AES-256-GCM encrypted

    -- HubSpot account info (populated after successful auth)
    hub_id TEXT,                           -- HubSpot portal/hub ID
    hub_domain TEXT,                       -- e.g. "mycompany.hubspot.com"
    account_name TEXT,                     -- Display name from HubSpot

    -- OAuth metadata
    scopes TEXT[],                         -- Granted OAuth scopes
    oauth_state TEXT,                      -- CSRF state parameter (temporary, cleared after callback)

    -- Connection config
    config_json JSONB NOT NULL DEFAULT '{}',  -- Extra settings (e.g., enabled objects, sync intervals)
    is_primary BOOLEAN NOT NULL DEFAULT false, -- Primary connection for the workspace

    -- Status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'connected', 'error', 'disconnected', 'expired')),
    last_validated_at TIMESTAMPTZ,
    last_error TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A workspace cannot have two connections with the same name
    CONSTRAINT hubspot_connections_workspace_name_unique UNIQUE (workspace_id, name)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_hubspot_connections_workspace ON hubspot_connections(workspace_id);
CREATE INDEX idx_hubspot_connections_workspace_active ON hubspot_connections(workspace_id)
    WHERE is_active = true;
CREATE INDEX idx_hubspot_connections_hub_id ON hubspot_connections(hub_id);

-- ============================================
-- TABLE: hubspot_sync_state
-- Tracks sync progress per connection per object type.
-- ============================================

CREATE TABLE hubspot_sync_state (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID NOT NULL REFERENCES hubspot_connections(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL,             -- 'contacts', 'companies', 'deals', 'tickets', etc.

    -- Sync progress
    last_sync_at TIMESTAMPTZ,             -- When the last successful sync completed
    last_sync_cursor TEXT,                -- HubSpot pagination cursor for incremental sync
    last_modified_at TIMESTAMPTZ,         -- HubSpot lastmodifieddate watermark
    records_synced INTEGER NOT NULL DEFAULT 0,
    total_records INTEGER,                -- Total records in HubSpot (if known)

    -- Sync lock (prevents concurrent syncs)
    sync_lock_id TEXT,                    -- Unique lock identifier
    sync_lock_expires_at TIMESTAMPTZ,     -- Lock expiry (auto-unlock after timeout)

    -- Status
    status TEXT NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle', 'syncing', 'error', 'backfilling')),
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One sync state per connection per object type
    CONSTRAINT hubspot_sync_state_connection_object_unique UNIQUE (connection_id, object_type)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_hubspot_sync_state_connection ON hubspot_sync_state(connection_id);

-- ============================================
-- TABLE: hubspot_records
-- Local cache of HubSpot CRM records for fast lookups and signal detection.
-- ============================================

CREATE TABLE hubspot_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID NOT NULL REFERENCES hubspot_connections(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- HubSpot identity
    hubspot_id TEXT NOT NULL,             -- HubSpot record ID (numeric string)
    object_type TEXT NOT NULL,            -- 'contacts', 'companies', 'deals', 'tickets', etc.

    -- Record data (full HubSpot properties snapshot)
    properties JSONB NOT NULL DEFAULT '{}',

    -- Timestamps from HubSpot
    hubspot_created_at TIMESTAMPTZ,
    hubspot_updated_at TIMESTAMPTZ,

    -- Local metadata
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One record per connection per HubSpot ID per object type
    CONSTRAINT hubspot_records_connection_object_id_unique UNIQUE (connection_id, object_type, hubspot_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_hubspot_records_workspace ON hubspot_records(workspace_id);
CREATE INDEX idx_hubspot_records_connection ON hubspot_records(connection_id);
CREATE INDEX idx_hubspot_records_connection_type ON hubspot_records(connection_id, object_type);
CREATE INDEX idx_hubspot_records_hubspot_id ON hubspot_records(hubspot_id);
CREATE INDEX idx_hubspot_records_updated ON hubspot_records(hubspot_updated_at);
-- GIN index on properties for JSONB queries
CREATE INDEX idx_hubspot_records_properties ON hubspot_records USING gin(properties);

-- ============================================
-- TABLE: hubspot_associations
-- Maps associations between HubSpot records (e.g., contact → company).
-- ============================================

CREATE TABLE hubspot_associations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID NOT NULL REFERENCES hubspot_connections(id) ON DELETE CASCADE,

    -- From record
    from_object_type TEXT NOT NULL,
    from_hubspot_id TEXT NOT NULL,

    -- To record
    to_object_type TEXT NOT NULL,
    to_hubspot_id TEXT NOT NULL,

    -- Association metadata
    association_type TEXT NOT NULL,        -- e.g., 'contact_to_company', 'deal_to_company'
    association_label TEXT,                -- Optional label from HubSpot

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One association per direction per connection
    CONSTRAINT hubspot_associations_unique UNIQUE (
        connection_id, from_object_type, from_hubspot_id, to_object_type, to_hubspot_id, association_type
    )
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_hubspot_associations_connection ON hubspot_associations(connection_id);
CREATE INDEX idx_hubspot_associations_from ON hubspot_associations(connection_id, from_object_type, from_hubspot_id);
CREATE INDEX idx_hubspot_associations_to ON hubspot_associations(connection_id, to_object_type, to_hubspot_id);

-- ============================================
-- RLS: Workspace isolation via workspace_members
-- ============================================

ALTER TABLE hubspot_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubspot_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubspot_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubspot_associations ENABLE ROW LEVEL SECURITY;

-- hubspot_connections: direct workspace_id column
CREATE POLICY "Users can view workspace hubspot connections"
    ON hubspot_connections FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace hubspot connections"
    ON hubspot_connections FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- hubspot_sync_state: via connection_id → hubspot_connections.workspace_id
CREATE POLICY "Users can view workspace hubspot sync state"
    ON hubspot_sync_state FOR SELECT
    USING (connection_id IN (
        SELECT id FROM hubspot_connections
        WHERE workspace_id IN (SELECT get_user_workspaces())
    ));

CREATE POLICY "Users can manage workspace hubspot sync state"
    ON hubspot_sync_state FOR ALL
    USING (connection_id IN (
        SELECT id FROM hubspot_connections
        WHERE workspace_id IN (SELECT get_user_workspaces())
    ));

-- hubspot_records: direct workspace_id column
CREATE POLICY "Users can view workspace hubspot records"
    ON hubspot_records FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace hubspot records"
    ON hubspot_records FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- hubspot_associations: via connection_id → hubspot_connections.workspace_id
CREATE POLICY "Users can view workspace hubspot associations"
    ON hubspot_associations FOR SELECT
    USING (connection_id IN (
        SELECT id FROM hubspot_connections
        WHERE workspace_id IN (SELECT get_user_workspaces())
    ));

CREATE POLICY "Users can manage workspace hubspot associations"
    ON hubspot_associations FOR ALL
    USING (connection_id IN (
        SELECT id FROM hubspot_connections
        WHERE workspace_id IN (SELECT get_user_workspaces())
    ));

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_hubspot_connections_updated_at
    BEFORE UPDATE ON hubspot_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hubspot_sync_state_updated_at
    BEFORE UPDATE ON hubspot_sync_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hubspot_records_updated_at
    BEFORE UPDATE ON hubspot_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE hubspot_connections IS 'HubSpot CRM connections, workspace-scoped. Supports OAuth and Private App Token auth.';
COMMENT ON COLUMN hubspot_connections.access_token_encrypted IS 'AES-256-GCM encrypted OAuth access token (format: salt:iv:tag:ciphertext)';
COMMENT ON COLUMN hubspot_connections.refresh_token_encrypted IS 'AES-256-GCM encrypted OAuth refresh token (format: salt:iv:tag:ciphertext)';
COMMENT ON COLUMN hubspot_connections.private_app_token_encrypted IS 'AES-256-GCM encrypted Private App token (format: salt:iv:tag:ciphertext)';
COMMENT ON TABLE hubspot_sync_state IS 'Tracks sync progress per HubSpot connection per object type.';
COMMENT ON TABLE hubspot_records IS 'Local cache of HubSpot CRM records for fast lookups and signal detection.';
COMMENT ON TABLE hubspot_associations IS 'Cached associations between HubSpot CRM records.';

-- ============================================
-- SEED: Add hubspot to integration_definitions registry
-- ============================================

INSERT INTO integration_definitions (
    name, display_name, description, category,
    icon_url, icon_url_light,
    required, display_order, setup_step_key,
    supports_self_hosted, config_schema
)
VALUES (
    'hubspot',
    'HubSpot',
    'Connect your HubSpot CRM to sync contacts, companies, deals, and tickets',
    'crm',
    'https://cdn.brandfetch.io/idnNYrmBqL/theme/dark/symbol.svg',
    'https://cdn.brandfetch.io/idnNYrmBqL/theme/light/symbol.svg',
    false,           -- Not required
    25,              -- After Attio (20)
    'hubspot',       -- Maps to wizard step component
    false,           -- Cloud-only HubSpot API
    '{"type": "object", "properties": {"auth_type": {"type": "string", "enum": ["oauth", "private_app"]}, "hub_id": {"type": "string"}, "scopes": {"type": "array", "items": {"type": "string"}}}, "description": "HubSpot CRM connection settings"}'::jsonb
);
