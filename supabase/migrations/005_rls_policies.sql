-- Migration: 005_rls_policies
-- Description: Row Level Security policies for multi-tenant isolation
-- Created: 2025-01-08

-- ============================================
-- HELPER FUNCTION: Get User's Workspaces
-- Returns workspace_ids the current user has access to
-- ============================================

CREATE OR REPLACE FUNCTION get_user_workspaces()
RETURNS SETOF UUID AS $$
    SELECT workspace_id
    FROM workspace_members
    WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================
-- HELPER FUNCTION: Check Workspace Access
-- Returns true if user has access to the given workspace
-- ============================================

CREATE OR REPLACE FUNCTION has_workspace_access(workspace_uuid UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_id = workspace_uuid
        AND user_id = auth.uid()
    )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE heuristic_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE posthog_workspace_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE attio_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stat_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_signal_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_identities ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS: Workspaces
-- Users can only see workspaces they are members of
-- ============================================

CREATE POLICY "Users can view their workspaces"
    ON workspaces FOR SELECT
    USING (id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can update their workspaces"
    ON workspaces FOR UPDATE
    USING (id IN (SELECT get_user_workspaces()));

-- Note: CREATE is handled by service role during signup flow

-- ============================================
-- RLS: Workspace Members
-- Users can see members of their workspaces
-- ============================================

CREATE POLICY "Users can view workspace members"
    ON workspace_members FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Admins can insert workspace members"
    ON workspace_members FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Admins can delete workspace members"
    ON workspace_members FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Accounts
-- Users can only see/manage accounts in their workspace
-- ============================================

CREATE POLICY "Users can view workspace accounts"
    ON accounts FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can create workspace accounts"
    ON accounts FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can update workspace accounts"
    ON accounts FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can delete workspace accounts"
    ON accounts FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Account Users
-- ============================================

CREATE POLICY "Users can view account users"
    ON account_users FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage account users"
    ON account_users FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Signals
-- ============================================

CREATE POLICY "Users can view workspace signals"
    ON signals FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can create workspace signals"
    ON signals FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can update workspace signals"
    ON signals FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can delete workspace signals"
    ON signals FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Opportunities
-- ============================================

CREATE POLICY "Users can view workspace opportunities"
    ON opportunities FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace opportunities"
    ON opportunities FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Metric Snapshots
-- ============================================

CREATE POLICY "Users can view workspace metric snapshots"
    ON metric_snapshots FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace metric snapshots"
    ON metric_snapshots FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Heuristic Scores
-- ============================================

CREATE POLICY "Users can view workspace heuristic scores"
    ON heuristic_scores FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace heuristic scores"
    ON heuristic_scores FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Account Clusters
-- ============================================

CREATE POLICY "Users can view workspace clusters"
    ON account_clusters FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace clusters"
    ON account_clusters FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Integration Configs
-- ============================================

CREATE POLICY "Users can view workspace integrations"
    ON integration_configs FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace integrations"
    ON integration_configs FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: PostHog Workspace Config
-- ============================================

CREATE POLICY "Users can view posthog config"
    ON posthog_workspace_config FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage posthog config"
    ON posthog_workspace_config FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: System Settings
-- ============================================

CREATE POLICY "Users can view workspace settings"
    ON system_settings FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace settings"
    ON system_settings FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Sync States
-- ============================================

CREATE POLICY "Users can view sync states"
    ON sync_states FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage sync states"
    ON sync_states FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Rate Limit Tracking
-- ============================================

CREATE POLICY "Users can view rate limits"
    ON rate_limit_tracking FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage rate limits"
    ON rate_limit_tracking FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Query Cache
-- ============================================

CREATE POLICY "Users can view query cache"
    ON query_cache FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage query cache"
    ON query_cache FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Attio Field Mappings
-- ============================================

CREATE POLICY "Users can view attio mappings"
    ON attio_field_mappings FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage attio mappings"
    ON attio_field_mappings FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Stat Test Runs
-- ============================================

CREATE POLICY "Users can view stat test runs"
    ON stat_test_runs FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage stat test runs"
    ON stat_test_runs FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Signal Aggregates
-- ============================================

CREATE POLICY "Users can view signal aggregates"
    ON signal_aggregates FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage signal aggregates"
    ON signal_aggregates FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: User Signal Preferences
-- ============================================

CREATE POLICY "Users can view their signal preferences"
    ON user_signal_preferences FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage their signal preferences"
    ON user_signal_preferences FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Dashboard Registry
-- ============================================

CREATE POLICY "Users can view dashboards"
    ON dashboard_registry FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage dashboards"
    ON dashboard_registry FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Insight Registry
-- ============================================

CREATE POLICY "Users can view insights"
    ON insight_registry FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage insights"
    ON insight_registry FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: API Keys
-- ============================================

CREATE POLICY "Users can view their API keys"
    ON api_keys FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can create API keys"
    ON api_keys FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()) AND user_id = auth.uid());

CREATE POLICY "Users can delete their API keys"
    ON api_keys FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()) AND user_id = auth.uid());

-- ============================================
-- RLS: Vault Secrets
-- ============================================

CREATE POLICY "Users can view workspace secrets"
    ON vault_secrets FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage workspace secrets"
    ON vault_secrets FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- RLS: Tracked Identities
-- ============================================

CREATE POLICY "Users can view tracked identities"
    ON tracked_identities FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage tracked identities"
    ON tracked_identities FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));
