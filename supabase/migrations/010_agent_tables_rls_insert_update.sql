-- Add INSERT and UPDATE RLS policies for agent integration tables.
-- The SELECT policies were created in 009_agent_integration.sql.
-- These policies enable authenticated users to write to their own workspace's
-- agent result tables (defense-in-depth for future UI features).

-- eda_results
CREATE POLICY "Users can create workspace eda results"
    ON eda_results FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can update workspace eda results"
    ON eda_results FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- website_exploration_results
CREATE POLICY "Users can create workspace website exploration"
    ON website_exploration_results FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can update workspace website exploration"
    ON website_exploration_results FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));
