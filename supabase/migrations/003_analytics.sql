-- Migration: 003_analytics
-- Description: Analytics, testing, and dashboard registry tables
-- Created: 2025-01-08

-- ============================================
-- ANALYTICS: Stat Test Runs
-- Stores backtest and signal validation runs
-- ============================================

CREATE TABLE stat_test_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID,  -- Optional: auth.users.id
    signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,

    -- Test configuration
    test_name VARCHAR(100) NOT NULL,  -- "backtest", "precision_recall", "lift_analysis"
    test_type VARCHAR(50) NOT NULL,  -- "user_signal", "global_signal", "segment"
    parameters_json JSONB DEFAULT '{}',

    -- Test execution
    status stat_test_status DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds NUMERIC(10, 3),

    -- Test results
    results_json JSONB DEFAULT '{}',
    precision NUMERIC(5, 4),  -- 0-1
    recall NUMERIC(5, 4),
    f1_score NUMERIC(5, 4),
    lift NUMERIC(8, 4),
    conversion_rate NUMERIC(5, 4),
    sample_size INTEGER,

    -- Metadata
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stat_test_runs_workspace_id ON stat_test_runs(workspace_id);
CREATE INDEX idx_stat_test_runs_test_name ON stat_test_runs(test_name);
CREATE INDEX idx_stat_test_runs_status ON stat_test_runs(status);

-- ============================================
-- ANALYTICS: Signal Aggregates
-- Aggregated signal performance metrics
-- ============================================

CREATE TABLE signal_aggregates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    signal_type VARCHAR(100) NOT NULL,

    -- Volume metrics
    total_count INTEGER DEFAULT 0,
    count_last_7d INTEGER DEFAULT 0,
    count_last_30d INTEGER DEFAULT 0,

    -- Performance metrics
    avg_precision NUMERIC(5, 4),
    avg_recall NUMERIC(5, 4),
    avg_f1_score NUMERIC(5, 4),
    avg_lift NUMERIC(8, 4),
    avg_conversion_rate NUMERIC(5, 4),

    -- Quality metrics
    confidence_score NUMERIC(5, 4),  -- 0-1
    quality_grade VARCHAR(5),  -- "A+", "A", "B", "C", "D", "F"

    -- Revenue impact
    total_arr_influenced NUMERIC(14, 2) DEFAULT 0.0,
    avg_deal_size NUMERIC(12, 2),
    win_rate NUMERIC(5, 4),

    -- Timing
    avg_days_to_close NUMERIC(8, 2),

    -- Metadata
    last_calculated_at TIMESTAMPTZ,
    calculation_window_days INTEGER DEFAULT 90,
    sample_size INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, signal_type)
);

CREATE INDEX idx_signal_aggregates_workspace_id ON signal_aggregates(workspace_id);
CREATE INDEX idx_signal_aggregates_signal_type ON signal_aggregates(signal_type);

-- ============================================
-- ANALYTICS: User Signal Preferences
-- User-specific signal preferences and tracking
-- ============================================

CREATE TABLE user_signal_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,  -- auth.users.id
    signal_type VARCHAR(100) NOT NULL,

    -- User preferences
    is_enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    custom_threshold NUMERIC(8, 4),
    notification_enabled BOOLEAN DEFAULT TRUE,

    -- User-specific performance
    user_conversion_rate NUMERIC(5, 4),
    user_win_rate NUMERIC(5, 4),
    user_avg_response_time_hours NUMERIC(8, 2),
    signals_received_count INTEGER DEFAULT 0,
    signals_acted_on_count INTEGER DEFAULT 0,

    -- Metadata
    last_signal_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, user_id, signal_type)
);

CREATE INDEX idx_user_signal_prefs_workspace_id ON user_signal_preferences(workspace_id);
CREATE INDEX idx_user_signal_prefs_user_id ON user_signal_preferences(user_id);

-- ============================================
-- DASHBOARD: Dashboard Registry
-- Tracks PostHog dashboards created by Beton
-- ============================================

CREATE TABLE dashboard_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    beton_dashboard_type VARCHAR(100) NOT NULL,  -- "signals_overview", "lead_activity"
    posthog_dashboard_id VARCHAR(255) NOT NULL,
    posthog_dashboard_uuid VARCHAR(255),
    posthog_dashboard_url TEXT,
    folder_path VARCHAR(255),  -- "Beton/Signals"
    schema_version VARCHAR(20) DEFAULT '1.0.0',
    insights_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, beton_dashboard_type)
);

CREATE INDEX idx_dashboard_registry_workspace_id ON dashboard_registry(workspace_id);

-- ============================================
-- DASHBOARD: Insight Registry
-- Tracks individual insights within dashboards
-- ============================================

CREATE TABLE insight_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    dashboard_id UUID NOT NULL REFERENCES dashboard_registry(id) ON DELETE CASCADE,

    beton_insight_type VARCHAR(100) NOT NULL,
    posthog_insight_id VARCHAR(255) NOT NULL,
    posthog_insight_uuid VARCHAR(255),
    query_hash VARCHAR(64),  -- Hash of HogQL query for change detection

    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insight_registry_workspace_id ON insight_registry(workspace_id);
CREATE INDEX idx_insight_registry_dashboard_id ON insight_registry(dashboard_id);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_stat_test_runs_updated_at
    BEFORE UPDATE ON stat_test_runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signal_aggregates_updated_at
    BEFORE UPDATE ON signal_aggregates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_signal_prefs_updated_at
    BEFORE UPDATE ON user_signal_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
