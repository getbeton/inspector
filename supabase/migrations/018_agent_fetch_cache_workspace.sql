-- Migration: 018_agent_fetch_cache_workspace
-- Description: Extend agent_fetch_cache for workspace-wide queries and user-facing reads
-- Created: 2026-02-22

-- ============================================
-- 1. Add workspace_id column (nullable first, then backfill)
-- ============================================

ALTER TABLE agent_fetch_cache
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id);

-- Backfill from workspace_agent_sessions
UPDATE agent_fetch_cache
SET workspace_id = s.workspace_id
FROM workspace_agent_sessions s
WHERE agent_fetch_cache.session_id = s.session_id;

-- Now set NOT NULL (all rows should have workspace_id after backfill)
ALTER TABLE agent_fetch_cache
    ALTER COLUMN workspace_id SET NOT NULL;

-- ============================================
-- 2. Add updated_at column with auto-update trigger
-- ============================================

ALTER TABLE agent_fetch_cache
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

-- Trigger function to auto-set updated_at on UPDATE
CREATE OR REPLACE FUNCTION set_agent_fetch_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_fetch_cache_updated_at
    BEFORE UPDATE ON agent_fetch_cache
    FOR EACH ROW
    EXECUTE FUNCTION set_agent_fetch_cache_updated_at();

-- ============================================
-- 3. Composite index for workspace-scoped queries
-- Covers: SELECT ... WHERE workspace_id = ? ORDER BY created_at DESC
-- ============================================

CREATE INDEX agent_fetch_cache_workspace_created_idx
    ON agent_fetch_cache (workspace_id, created_at DESC);

-- ============================================
-- 4. User-facing RLS read policy
-- Uses get_user_workspaces() (SECURITY DEFINER) from migration 005
-- to avoid RLS recursion on workspace_members.
-- Writes remain service-role only — no INSERT/UPDATE/DELETE policies.
-- ============================================

CREATE POLICY "Users can read own workspace fetch cache"
    ON agent_fetch_cache FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));
