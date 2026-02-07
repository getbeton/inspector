-- Migration: 009_agent_integration
-- Description: Tables for Agent integration (EDA results, Website exploration) and workspace website

-- Created: 2026-01-31

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE plg_type AS ENUM ('plg', 'slg', 'hybrid', 'not_applicable');

-- ============================================
-- TABLE: workspaces (Updates)
-- Add website_url for Agent analysis
-- ============================================

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS website_url TEXT;


-- ============================================
-- TABLE: website_exploration_results
-- Stores results from the 'upsell_agent' website analysis
-- ============================================

CREATE TABLE website_exploration_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    is_b2b BOOLEAN,
    plg_type plg_type,
    website_url TEXT,
    product_assumptions JSONB DEFAULT '[]', -- List of strings
    icp_description TEXT,
    product_description TEXT,
    pricing_model JSONB DEFAULT '{}', -- Multi-label classification results

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One exploration result per workspace (latest)
    UNIQUE (workspace_id)
);

CREATE INDEX idx_website_exploration_workspace_id ON website_exploration_results(workspace_id);

-- ============================================
-- TABLE: eda_results
-- Stores results from 'dwh_analyst' and 'upsell_agent' data analysis
-- ============================================

CREATE TABLE eda_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- Identifier for the table/dataset being analyzed
    table_id TEXT NOT NULL, 

    -- Analysis Content
    join_suggestions JSONB DEFAULT '[]', -- Pairs of joins
    metrics_discovery JSONB DEFAULT '[]', -- Discovered metrics descriptions
    table_stats JSONB DEFAULT '{}', -- Descriptive stats (count, mean, etc.)
    summary_text TEXT, -- Natural language summary

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique per table per workspace? Or just append log? 
    -- "How do we store EDA results... Expect pair join suggestions stored in 5 column table..."
    -- The prompt suggests structure. Let's start with JSONB for flexibility as Agent output evolves.
    UNIQUE(workspace_id, table_id)
);

CREATE INDEX idx_eda_results_workspace_id ON eda_results(workspace_id);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_website_exploration_results_updated_at
    BEFORE UPDATE ON website_exploration_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_eda_results_updated_at
    BEFORE UPDATE ON eda_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ENABLE RLS
-- ============================================

ALTER TABLE website_exploration_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE eda_results ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- website_exploration_results
CREATE POLICY "Users can view workspace website exploration"
    ON website_exploration_results FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- INSERT/UPDATE handled by service role (Agent API) generally, but if we want to allow 
-- authenticated Agent calls (simulated via API route which uses Service Role), this is fine.

-- eda_results
CREATE POLICY "Users can view workspace eda results"
    ON eda_results FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

