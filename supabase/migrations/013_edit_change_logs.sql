-- Migration: 013_edit_change_logs
-- Description: Audit logs for user edits to business model fields and join candidates
-- Created: 2026-02-05

-- ============================================
-- 1. Business model field edit log
-- ============================================

CREATE TABLE business_model_edit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,        -- JSON-stringified
    new_value TEXT,        -- JSON-stringified
    changed_by_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bm_edit_log_workspace ON business_model_edit_log(workspace_id, created_at DESC);

-- ============================================
-- 2. Join candidate edit log
-- ============================================

CREATE TABLE join_candidate_edit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL,   -- 'add', 'remove', 'update'
    table1 TEXT NOT NULL,
    table2 TEXT NOT NULL,
    old_col1 TEXT,               -- null for 'add'
    old_col2 TEXT,               -- null for 'add'
    new_col1 TEXT,               -- null for 'remove'
    new_col2 TEXT,               -- null for 'remove'
    changed_by_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jc_edit_log_workspace ON join_candidate_edit_log(workspace_id, created_at DESC);

-- ============================================
-- 3. RLS policies
-- ============================================

ALTER TABLE business_model_edit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_candidate_edit_log ENABLE ROW LEVEL SECURITY;

-- Service role (agent + admin) can do anything
CREATE POLICY "Service role full access on bm_edit_log"
    ON business_model_edit_log FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on jc_edit_log"
    ON join_candidate_edit_log FOR ALL
    USING (true) WITH CHECK (true);
