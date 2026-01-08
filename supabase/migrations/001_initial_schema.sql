-- Migration: 001_initial_schema
-- Description: Core tables for multi-tenant RevOps platform
-- Created: 2025-01-08

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE account_status AS ENUM ('active', 'churned', 'trial');
CREATE TYPE opportunity_stage AS ENUM ('detected', 'qualified', 'in_progress', 'closed_won', 'closed_lost');
CREATE TYPE integration_status AS ENUM ('connected', 'disconnected', 'error', 'validating');
CREATE TYPE stat_test_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- ============================================
-- MULTI-TENANCY: Workspaces
-- ============================================

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,

    -- Billing (Stripe integration)
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    subscription_status VARCHAR(50) DEFAULT 'active',
    billing_cycle_start TIMESTAMPTZ,
    next_billing_date TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workspaces_slug ON workspaces(slug);

-- ============================================
-- MULTI-TENANCY: Workspace Members
-- Links Supabase auth.users to workspaces
-- ============================================

CREATE TABLE workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,  -- References auth.users(id) from Supabase Auth
    role VARCHAR(50) DEFAULT 'member',  -- owner, admin, member
    joined_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);

-- ============================================
-- CORE: Accounts (Customers being tracked)
-- ============================================

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255),
    domain VARCHAR(255),
    arr NUMERIC(12, 2) DEFAULT 0.0,
    plan VARCHAR(100) DEFAULT 'free',
    status account_status DEFAULT 'active',
    health_score NUMERIC(5, 2) DEFAULT 0.0,
    fit_score NUMERIC(5, 4) DEFAULT 0.0,  -- ICP fit score (0.0-1.0)
    last_activity_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounts_workspace_id ON accounts(workspace_id);
CREATE INDEX idx_accounts_domain ON accounts(domain);
CREATE INDEX idx_accounts_name ON accounts(name);

-- ============================================
-- CORE: Users (Contacts within accounts)
-- ============================================

CREATE TABLE account_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

    email VARCHAR(255),
    name VARCHAR(255),
    role VARCHAR(100),  -- e.g., "admin", "member"
    title VARCHAR(255),  -- e.g., "CTO", "Developer"

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_account_users_workspace_id ON account_users(workspace_id);
CREATE INDEX idx_account_users_account_id ON account_users(account_id);
CREATE INDEX idx_account_users_email ON account_users(email);

-- ============================================
-- CORE: Signals (Product usage signals)
-- ============================================

CREATE TABLE signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

    type VARCHAR(100) NOT NULL,  -- e.g., "usage_spike", "billing_increase"
    value NUMERIC(12, 4),  -- Quantitative value if applicable
    details JSONB DEFAULT '{}',  -- Extra context
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    source VARCHAR(100),  -- e.g., "posthog", "stripe"

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_workspace_id ON signals(workspace_id);
CREATE INDEX idx_signals_account_id ON signals(account_id);
CREATE INDEX idx_signals_type ON signals(type);
CREATE INDEX idx_signals_timestamp ON signals(timestamp);

-- ============================================
-- CORE: Opportunities (Sales opportunities from signals)
-- ============================================

CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

    stage opportunity_stage DEFAULT 'detected',
    value NUMERIC(12, 2) DEFAULT 0.0,
    ai_summary TEXT,  -- AI-generated explanation

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opportunities_workspace_id ON opportunities(workspace_id);
CREATE INDEX idx_opportunities_account_id ON opportunities(account_id);
CREATE INDEX idx_opportunities_stage ON opportunities(stage);

-- ============================================
-- HEURISTICS: Metric Snapshots
-- Pre-aggregated metrics for dashboard performance
-- ============================================

CREATE TABLE metric_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC(12, 4) NOT NULL,
    snapshot_date DATE NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metric_snapshots_workspace_id ON metric_snapshots(workspace_id);
CREATE INDEX idx_metric_snapshots_account_id ON metric_snapshots(account_id);
CREATE INDEX idx_metric_snapshots_metric_name ON metric_snapshots(metric_name);
CREATE INDEX idx_metric_snapshots_date ON metric_snapshots(snapshot_date);

-- ============================================
-- HEURISTICS: Heuristic Scores
-- Calculated scores (health, expansion, churn risk)
-- ============================================

CREATE TABLE heuristic_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

    score_type VARCHAR(50) NOT NULL,  -- "health", "expansion", "churn_risk"
    score_value NUMERIC(5, 2) NOT NULL,  -- 0-100 scale
    component_scores JSONB,  -- Breakdown by signal: {signal_name: weight_contribution}
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,  -- Score expiration

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_heuristic_scores_workspace_id ON heuristic_scores(workspace_id);
CREATE INDEX idx_heuristic_scores_account_id ON heuristic_scores(account_id);
CREATE INDEX idx_heuristic_scores_type ON heuristic_scores(score_type);

-- ============================================
-- HEURISTICS: Account Clusters
-- ML clustering results for segmentation
-- ============================================

CREATE TABLE account_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

    cluster_id INTEGER NOT NULL,
    cluster_label VARCHAR(100),  -- e.g., "Power Users", "At Risk"
    confidence_score NUMERIC(3, 2),  -- 0.0-1.0
    features JSONB,  -- Feature vector used for clustering

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_account_clusters_workspace_id ON account_clusters(workspace_id);
CREATE INDEX idx_account_clusters_account_id ON account_clusters(account_id);
CREATE INDEX idx_account_clusters_cluster_id ON account_clusters(cluster_id);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_opportunities_updated_at
    BEFORE UPDATE ON opportunities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
