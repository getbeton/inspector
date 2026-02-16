-- Migration: 015_workspace_sync_log
-- Description: Sync job tracking table for cron visibility and manual trigger rate limiting
-- Created: 2026-02-08

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS workspace_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,           -- 'signal_detection', 'mtu_tracking', 'sync_signals', 'posthog_events'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
  result JSONB,
  error TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'cron',  -- 'cron' or 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_workspace_sync_log_lookup
  ON workspace_sync_log(workspace_id, sync_type, started_at DESC);

-- ============================================
-- RLS: Enable and add policies
-- ============================================

ALTER TABLE workspace_sync_log ENABLE ROW LEVEL SECURITY;

-- Workspace members can read their own sync logs
CREATE POLICY "workspace_members_select_sync_log"
  ON workspace_sync_log FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

-- Only service role (cron/API) can insert/update sync logs
-- No INSERT/UPDATE policy for regular users — only service_role bypasses RLS
