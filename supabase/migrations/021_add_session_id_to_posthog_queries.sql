-- Migration: 021_add_session_id_to_posthog_queries
-- Description: Add session_id FK to posthog_queries and posthog_query_results
--              for agent query traceability per session
-- Created: 2026-02-24
-- Pattern: Same as migration 012 (session_id on eda_results)

-- ============================================
-- 1. Add session_id FK to posthog_queries
-- ============================================

ALTER TABLE posthog_queries
    ADD COLUMN IF NOT EXISTS session_id UUID
    REFERENCES workspace_agent_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posthog_queries_session_id
    ON posthog_queries(session_id);

-- ============================================
-- 2. Add session_id FK to posthog_query_results
-- ============================================

ALTER TABLE posthog_query_results
    ADD COLUMN IF NOT EXISTS session_id UUID
    REFERENCES workspace_agent_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posthog_query_results_session_id
    ON posthog_query_results(session_id);
