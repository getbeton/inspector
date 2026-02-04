-- Migration: 011_workspace_agent_sessions
-- Description: Session tracking for Agent ↔ Inspector interactions
-- Created: 2026-02-04

-- ============================================
-- ENUM: agent_session_status
-- ============================================

CREATE TYPE agent_session_status AS ENUM (
    'created',
    'running',
    'completed',
    'failed',
    'closed'
);

-- ============================================
-- TABLE: workspace_agent_sessions
-- Tracks lifecycle of each Agent analysis session
-- ============================================

CREATE TABLE workspace_agent_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id TEXT NOT NULL UNIQUE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    status agent_session_status NOT NULL DEFAULT 'created',
    agent_app_name TEXT NOT NULL DEFAULT 'upsell_agent',

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_agent_sessions_workspace_id ON workspace_agent_sessions(workspace_id);
CREATE INDEX idx_agent_sessions_session_id ON workspace_agent_sessions(session_id);
CREATE INDEX idx_agent_sessions_status ON workspace_agent_sessions(status);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_workspace_agent_sessions_updated_at
    BEFORE UPDATE ON workspace_agent_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ENABLE RLS
-- ============================================

ALTER TABLE workspace_agent_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Users can view sessions for their own workspace
CREATE POLICY "Users can view workspace agent sessions"
    ON workspace_agent_sessions FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- Users can create sessions for their own workspace
CREATE POLICY "Users can create workspace agent sessions"
    ON workspace_agent_sessions FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

-- Users can update sessions for their own workspace
CREATE POLICY "Users can update workspace agent sessions"
    ON workspace_agent_sessions FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));
