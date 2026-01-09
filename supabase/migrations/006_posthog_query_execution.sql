-- Migration: 006_posthog_query_execution
-- Description: PostHog Query Execution Backend - tables for query tracking, results caching, saved queries, and dashboards
-- Created: 2026-01-09
-- Epic: BETON-59

-- ============================================
-- WORKSPACE CONTEXT FUNCTIONS
-- For RLS policies that use service role with workspace isolation
-- ============================================

-- Set workspace context for the current session/transaction
-- Called by middleware before any database queries
CREATE OR REPLACE FUNCTION set_workspace_context(workspace_uuid UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.workspace_id', workspace_uuid::TEXT, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current workspace context
-- Returns NULL if not set
CREATE OR REPLACE FUNCTION get_workspace_context()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.workspace_id', TRUE), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- ENUM: Query Status
-- ============================================

CREATE TYPE posthog_query_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'timeout'
);

-- ============================================
-- TABLE: posthog_queries
-- Tracks each query execution request
-- ============================================

CREATE TABLE posthog_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Query details
    query_text TEXT NOT NULL,
    query_hash VARCHAR(64) NOT NULL,  -- SHA256 hash for caching/deduplication

    -- Execution status
    status posthog_query_status NOT NULL DEFAULT 'pending',
    execution_time_ms INTEGER,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes for posthog_queries
CREATE INDEX idx_posthog_queries_workspace_id ON posthog_queries(workspace_id);
CREATE INDEX idx_posthog_queries_query_hash ON posthog_queries(query_hash);
CREATE INDEX idx_posthog_queries_status ON posthog_queries(status);
-- Critical index for rate limiting: COUNT queries in last hour
CREATE INDEX idx_posthog_queries_rate_limit ON posthog_queries(workspace_id, created_at DESC);

-- ============================================
-- TABLE: posthog_query_results
-- Permanent storage for query results (cache)
-- ============================================

CREATE TABLE posthog_query_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    query_id UUID NOT NULL REFERENCES posthog_queries(id) ON DELETE CASCADE,

    -- Cache key
    query_hash VARCHAR(64) NOT NULL,  -- SHA256 hash for cache lookups

    -- Result data
    columns JSONB NOT NULL DEFAULT '[]',  -- Array of column names: ["event", "count"]
    results JSONB NOT NULL DEFAULT '[]',  -- Array of row arrays: [["$pageview", 1000], ...]
    row_count INTEGER NOT NULL DEFAULT 0,

    -- Cache metadata
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- Optional: automatic cache invalidation

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for posthog_query_results
CREATE INDEX idx_posthog_query_results_workspace_id ON posthog_query_results(workspace_id);
CREATE INDEX idx_posthog_query_results_query_id ON posthog_query_results(query_id);
-- Critical index for cache lookups by hash (< 5ms target)
CREATE INDEX idx_posthog_query_results_cache_lookup ON posthog_query_results(workspace_id, query_hash, cached_at DESC);

-- ============================================
-- TABLE: posthog_saved_queries
-- Saved query definitions synced with PostHog
-- ============================================

CREATE TABLE posthog_saved_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- PostHog reference
    posthog_query_id VARCHAR(100),  -- ID in PostHog system (after sync)

    -- Query definition
    name VARCHAR(255) NOT NULL,
    description TEXT,
    query_text TEXT NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for posthog_saved_queries
CREATE INDEX idx_posthog_saved_queries_workspace_id ON posthog_saved_queries(workspace_id);
CREATE INDEX idx_posthog_saved_queries_posthog_id ON posthog_saved_queries(posthog_query_id);
CREATE INDEX idx_posthog_saved_queries_active ON posthog_saved_queries(workspace_id, is_active);

-- ============================================
-- TABLE: posthog_dashboards
-- Dashboard configurations synced with PostHog
-- ============================================

CREATE TABLE posthog_dashboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- PostHog reference
    posthog_dashboard_id VARCHAR(100),  -- ID in PostHog system (after sync)

    -- Dashboard definition
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB DEFAULT '{}',  -- Dashboard layout and widget configuration

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for posthog_dashboards
CREATE INDEX idx_posthog_dashboards_workspace_id ON posthog_dashboards(workspace_id);
CREATE INDEX idx_posthog_dashboards_posthog_id ON posthog_dashboards(posthog_dashboard_id);
CREATE INDEX idx_posthog_dashboards_active ON posthog_dashboards(workspace_id, is_active);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_posthog_saved_queries_updated_at
    BEFORE UPDATE ON posthog_saved_queries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posthog_dashboards_updated_at
    BEFORE UPDATE ON posthog_dashboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ENABLE RLS ON ALL NEW TABLES
-- ============================================

ALTER TABLE posthog_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE posthog_query_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE posthog_saved_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE posthog_dashboards ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES: posthog_queries
-- Uses workspace context OR user's workspaces
-- ============================================

CREATE POLICY "posthog_queries_select_policy"
    ON posthog_queries FOR SELECT
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_queries_insert_policy"
    ON posthog_queries FOR INSERT
    WITH CHECK (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_queries_update_policy"
    ON posthog_queries FOR UPDATE
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_queries_delete_policy"
    ON posthog_queries FOR DELETE
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

-- ============================================
-- RLS POLICIES: posthog_query_results
-- ============================================

CREATE POLICY "posthog_query_results_select_policy"
    ON posthog_query_results FOR SELECT
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_query_results_insert_policy"
    ON posthog_query_results FOR INSERT
    WITH CHECK (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_query_results_update_policy"
    ON posthog_query_results FOR UPDATE
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_query_results_delete_policy"
    ON posthog_query_results FOR DELETE
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

-- ============================================
-- RLS POLICIES: posthog_saved_queries
-- ============================================

CREATE POLICY "posthog_saved_queries_select_policy"
    ON posthog_saved_queries FOR SELECT
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_saved_queries_insert_policy"
    ON posthog_saved_queries FOR INSERT
    WITH CHECK (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_saved_queries_update_policy"
    ON posthog_saved_queries FOR UPDATE
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_saved_queries_delete_policy"
    ON posthog_saved_queries FOR DELETE
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

-- ============================================
-- RLS POLICIES: posthog_dashboards
-- ============================================

CREATE POLICY "posthog_dashboards_select_policy"
    ON posthog_dashboards FOR SELECT
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_dashboards_insert_policy"
    ON posthog_dashboards FOR INSERT
    WITH CHECK (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_dashboards_update_policy"
    ON posthog_dashboards FOR UPDATE
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

CREATE POLICY "posthog_dashboards_delete_policy"
    ON posthog_dashboards FOR DELETE
    USING (
        workspace_id = get_workspace_context()
        OR workspace_id IN (SELECT get_user_workspaces())
    );

-- ============================================
-- COMMENTS: Table Documentation
-- ============================================

COMMENT ON TABLE posthog_queries IS 'Tracks PostHog HogQL query executions with status and timing';
COMMENT ON TABLE posthog_query_results IS 'Caches query results by hash for deduplication and fast retrieval';
COMMENT ON TABLE posthog_saved_queries IS 'Saved query definitions synced with PostHog';
COMMENT ON TABLE posthog_dashboards IS 'Dashboard configurations synced with PostHog';

COMMENT ON FUNCTION set_workspace_context IS 'Sets workspace context for RLS policies - call before database queries';
COMMENT ON FUNCTION get_workspace_context IS 'Gets current workspace context set by set_workspace_context()';

COMMENT ON INDEX idx_posthog_queries_rate_limit IS 'Optimized for rate limit check: COUNT(*) WHERE workspace_id = X AND created_at > now() - 1 hour';
COMMENT ON INDEX idx_posthog_query_results_cache_lookup IS 'Optimized for cache lookup by hash: < 5ms target';
