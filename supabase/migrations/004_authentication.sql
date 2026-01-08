-- Migration: 004_authentication
-- Description: Authentication, API keys, and credential storage
-- Created: 2025-01-08

-- ============================================
-- AUTH: API Keys
-- Stores API keys for programmatic authentication
-- Keys are hashed with bcrypt - only hash stored
-- ============================================

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,  -- Supabase auth.users.id

    key_hash VARCHAR(255) NOT NULL UNIQUE,  -- bcrypt hash of actual key
    name VARCHAR(100) NOT NULL DEFAULT 'Default Key',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,  -- Expires 90 days after creation

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_workspace_id ON api_keys(workspace_id);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at);

-- ============================================
-- AUTH: Vault Secrets
-- Stores encrypted integration credentials
-- Secret column is encrypted using pgsodium/Vault
-- ============================================

CREATE TABLE vault_secrets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,  -- e.g., "posthog_api_key"
    secret TEXT NOT NULL,  -- Will be encrypted by Vault extension
    secret_metadata JSONB DEFAULT '{}',  -- {project_id, project_name} - not encrypted

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, name)
);

CREATE INDEX idx_vault_secrets_workspace_id ON vault_secrets(workspace_id);

-- ============================================
-- TRACKING: Tracked Identities
-- Tracks PostHog persons for billing
-- Updated daily by sync job
-- ============================================

CREATE TABLE tracked_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    person_id VARCHAR(255) NOT NULL,  -- PostHog person ID
    email VARCHAR(255),  -- PostHog person email if captured
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, person_id)
);

CREATE INDEX idx_tracked_identities_workspace_id ON tracked_identities(workspace_id);
CREATE INDEX idx_tracked_identities_workspace_active ON tracked_identities(workspace_id, is_active);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_vault_secrets_updated_at
    BEFORE UPDATE ON vault_secrets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tracked_identities_updated_at
    BEFORE UPDATE ON tracked_identities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
