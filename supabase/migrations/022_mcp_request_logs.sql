-- MCP request logging table for tool invocation tracking
CREATE TABLE mcp_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  session_id TEXT REFERENCES workspace_agent_sessions(session_id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',  -- success | error
  status_code INTEGER,
  duration_ms INTEGER,
  request_params JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for primary query pattern (filter by workspace, order by time)
CREATE INDEX idx_mcp_logs_workspace_time ON mcp_request_logs(workspace_id, created_at DESC);

-- Index for session filtering
CREATE INDEX idx_mcp_logs_session ON mcp_request_logs(session_id) WHERE session_id IS NOT NULL;

-- Cursor-based pagination index (workspace + created_at + id for tie-breaking)
CREATE INDEX idx_mcp_logs_cursor ON mcp_request_logs(workspace_id, created_at DESC, id DESC);

-- RLS policies
ALTER TABLE mcp_request_logs ENABLE ROW LEVEL SECURITY;

-- CRITICAL: Wrap auth.uid() in (select ...) to avoid per-row evaluation
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations
CREATE POLICY "workspace_members_read" ON mcp_request_logs
  FOR SELECT USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = (select auth.uid())
    )
  );

-- Service role can insert (from MCP server via API route using service role key)
CREATE POLICY "service_insert" ON mcp_request_logs
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE mcp_request_logs IS 'Tracks MCP tool invocations for the Request Logs settings tab';
COMMENT ON COLUMN mcp_request_logs.session_id IS 'Nullable FK — some MCP requests may not have an associated agent session';
