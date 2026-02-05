-- Migration: 012_per_session_results
-- Description: Scope EDA and website exploration results per session, add confirmed_joins to sessions
-- Created: 2026-02-04

-- ============================================
-- 1. Add session_id FK to eda_results
-- ============================================

ALTER TABLE eda_results
    ADD COLUMN session_id UUID REFERENCES workspace_agent_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_eda_results_session_id ON eda_results(session_id);

-- ============================================
-- 2. Add session_id FK to website_exploration_results
-- ============================================

ALTER TABLE website_exploration_results
    ADD COLUMN session_id UUID REFERENCES workspace_agent_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_website_exploration_session_id ON website_exploration_results(session_id);

-- ============================================
-- 3. Add confirmed_joins JSONB to workspace_agent_sessions
-- ============================================

ALTER TABLE workspace_agent_sessions
    ADD COLUMN confirmed_joins JSONB DEFAULT '[]';

-- ============================================
-- 4. Update UNIQUE constraints
--    eda_results: (workspace_id, table_id) → (workspace_id, session_id, table_id)
--    website_exploration_results: (workspace_id) → (workspace_id, session_id)
-- ============================================

-- Drop old constraints
ALTER TABLE eda_results DROP CONSTRAINT IF EXISTS eda_results_workspace_id_table_id_key;
ALTER TABLE website_exploration_results DROP CONSTRAINT IF EXISTS website_exploration_results_workspace_id_key;

-- Create new constraints (session_id can be null for legacy rows)
CREATE UNIQUE INDEX ux_eda_results_ws_session_table
    ON eda_results (workspace_id, COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid), table_id);

CREATE UNIQUE INDEX ux_website_exploration_ws_session
    ON website_exploration_results (workspace_id, COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================
-- 5. Backfill: link existing rows to the latest completed session per workspace
-- ============================================

-- Backfill eda_results
UPDATE eda_results er
SET session_id = latest.id
FROM (
    SELECT DISTINCT ON (workspace_id) id, workspace_id
    FROM workspace_agent_sessions
    WHERE status = 'completed'
    ORDER BY workspace_id, completed_at DESC NULLS LAST
) latest
WHERE er.workspace_id = latest.workspace_id
  AND er.session_id IS NULL;

-- Backfill website_exploration_results
UPDATE website_exploration_results wer
SET session_id = latest.id
FROM (
    SELECT DISTINCT ON (workspace_id) id, workspace_id
    FROM workspace_agent_sessions
    WHERE status = 'completed'
    ORDER BY workspace_id, completed_at DESC NULLS LAST
) latest
WHERE wer.workspace_id = latest.workspace_id
  AND wer.session_id IS NULL;
