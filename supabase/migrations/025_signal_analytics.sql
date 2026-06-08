-- Migration 025: Signal Analytics
--
-- Adds tables for pre-computed signal analytics, cohort retention,
-- property mappings, and extends signal_definitions with conversion config.
--
-- New tables:
--   signal_analytics_snapshots  – monthly time-series data per signal per conversion window
--   signal_cohort_retention     – M0-M8 retention data per signal
--   posthog_property_mappings   – maps PostHog user properties to plan/segment/revenue
--   attio_deal_mappings         – maps Attio deal stages to conversion states
--
-- Altered tables:
--   signal_definitions          – adds conversion_type, retention_event_name

-- ============================================================
-- 1. Extend signal_definitions with conversion + retention config
-- ============================================================

-- conversion_type: what counts as a conversion for this signal
-- 'posthog_event' = a specific PostHog event
-- 'attio_deal_won' = Attio deal reaching "Won" stage
-- 'either' = whichever fires first
ALTER TABLE signal_definitions
    ADD COLUMN conversion_type VARCHAR(20) DEFAULT 'posthog_event'
        CHECK (conversion_type IN ('posthog_event', 'attio_deal_won', 'either'));

-- retention_event_name: PostHog event to track for retention analysis
-- (separate from the signal trigger event and conversion event)
ALTER TABLE signal_definitions
    ADD COLUMN retention_event_name VARCHAR(255);

-- ============================================================
-- 2. Signal Analytics Snapshots
-- Pre-computed monthly time-series per signal per conversion window.
-- One row per (workspace, signal_definition, window, month).
-- ============================================================

CREATE TABLE signal_analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    signal_definition_id UUID NOT NULL REFERENCES signal_definitions(id) ON DELETE CASCADE,

    -- Conversion window in days (7, 14, 30, 60, 90); NULL = no limit
    conversion_window_days INTEGER,

    -- Month bucket (first day of month, UTC)
    month DATE NOT NULL,

    -- KPI metrics for this window
    users_with_signal INTEGER DEFAULT 0,
    converted_users INTEGER DEFAULT 0,
    additional_net_revenue NUMERIC(14, 2) DEFAULT 0,
    statistical_significance NUMERIC(5, 2),   -- 0-100 percentage
    p_value NUMERIC(8, 6),                    -- e.g. 0.027

    -- Revenue breakdown (signal vs other)
    revenue_signal NUMERIC(14, 2) DEFAULT 0,
    revenue_other NUMERIC(14, 2) DEFAULT 0,

    -- Signal occurrences count this month
    occurrences INTEGER DEFAULT 0,

    -- Conversion rates (percentage)
    conversion_rate_signal NUMERIC(6, 2),
    conversion_rate_nosignal NUMERIC(6, 2),

    -- Average contract value
    acv_signal NUMERIC(12, 2),
    acv_nosignal NUMERIC(12, 2),

    -- Per-customer breakdown (top N customers this month)
    -- [{name, spend, speed}] where speed: 1=fast, 2=medium, 3=slow
    customer_breakdown JSONB DEFAULT '[]',

    -- Metadata
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One row per (workspace, signal, window, month)
    UNIQUE (workspace_id, signal_definition_id, conversion_window_days, month)
);

CREATE INDEX idx_signal_analytics_workspace
    ON signal_analytics_snapshots(workspace_id);
CREATE INDEX idx_signal_analytics_definition
    ON signal_analytics_snapshots(signal_definition_id);
CREATE INDEX idx_signal_analytics_month
    ON signal_analytics_snapshots(month DESC);
CREATE INDEX idx_signal_analytics_lookup
    ON signal_analytics_snapshots(workspace_id, signal_definition_id, conversion_window_days, month DESC);

-- ============================================================
-- 3. Signal Cohort Retention
-- M0-M8 retention data per signal, broken down by tab/stat.
-- One row per (workspace, signal_definition, tab, stat_mode).
-- ============================================================

CREATE TABLE signal_cohort_retention (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    signal_definition_id UUID NOT NULL REFERENCES signal_definitions(id) ON DELETE CASCADE,

    -- Tab: which metric we're tracking retention for
    -- 'users' = user count retention
    -- 'events' = event volume retention
    -- 'revenue' = revenue retention
    tab VARCHAR(10) NOT NULL CHECK (tab IN ('users', 'events', 'revenue')),

    -- Stat mode (only relevant for events/revenue tabs)
    -- 'total' = sum, 'avg' = per-user average, 'median' = per-user median
    stat_mode VARCHAR(10) NOT NULL DEFAULT 'total'
        CHECK (stat_mode IN ('total', 'avg', 'median')),

    -- Retention values M0-M8 (percentage of M0 baseline, which is always 100)
    -- Stored as arrays: index 0 = M0 (always 100), index 8 = M8
    signal_values NUMERIC(6, 1)[] NOT NULL DEFAULT ARRAY[100]::NUMERIC(6,1)[],
    nosignal_values NUMERIC(6, 1)[] NOT NULL DEFAULT ARRAY[100]::NUMERIC(6,1)[],

    -- Metadata
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One row per (workspace, signal, tab, stat)
    UNIQUE (workspace_id, signal_definition_id, tab, stat_mode)
);

CREATE INDEX idx_signal_cohort_workspace
    ON signal_cohort_retention(workspace_id);
CREATE INDEX idx_signal_cohort_definition
    ON signal_cohort_retention(signal_definition_id);

-- ============================================================
-- 4. Signal Time-to-Conversion Curves
-- P0-P12 conversion curves (period + cumulative) per signal.
-- ============================================================

CREATE TABLE signal_conversion_curves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    signal_definition_id UUID NOT NULL REFERENCES signal_definitions(id) ON DELETE CASCADE,

    -- Period conversion percentages P0-P12 (13 values)
    signal_period NUMERIC(5, 2)[] NOT NULL DEFAULT ARRAY[0]::NUMERIC(5,2)[],
    nosignal_period NUMERIC(5, 2)[] NOT NULL DEFAULT ARRAY[0]::NUMERIC(5,2)[],

    -- Cumulative conversion percentages P0-P12 (13 values, running sums)
    signal_cumulative NUMERIC(5, 2)[] NOT NULL DEFAULT ARRAY[0]::NUMERIC(5,2)[],
    nosignal_cumulative NUMERIC(5, 2)[] NOT NULL DEFAULT ARRAY[0]::NUMERIC(5,2)[],

    -- Metadata
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One row per (workspace, signal)
    UNIQUE (workspace_id, signal_definition_id)
);

CREATE INDEX idx_signal_conv_curves_workspace
    ON signal_conversion_curves(workspace_id);

-- ============================================================
-- 5. PostHog Property Mappings
-- Global workspace-level mappings from PostHog user properties
-- to plan tiers, segments, and revenue values.
-- ============================================================

CREATE TABLE posthog_property_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- What this mapping is for
    -- 'plan' = maps property value to pricing plan tier
    -- 'segment' = maps property value to customer segment
    -- 'revenue' = maps property value to revenue amount
    mapping_type VARCHAR(20) NOT NULL
        CHECK (mapping_type IN ('plan', 'segment', 'revenue')),

    -- The PostHog user property name (e.g., "subscription_plan", "company_size")
    posthog_property VARCHAR(255) NOT NULL,

    -- The PostHog property value to match (e.g., "pro", "enterprise")
    property_value VARCHAR(255) NOT NULL,

    -- The Beton-side label (e.g., "Pro", "Enterprise", "SMB")
    mapped_label VARCHAR(100) NOT NULL,

    -- For revenue mappings: the numeric value
    mapped_value NUMERIC(14, 2),

    -- Display order
    sort_order INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One mapping per (workspace, type, property, value)
    UNIQUE (workspace_id, mapping_type, posthog_property, property_value)
);

CREATE INDEX idx_posthog_property_mappings_workspace
    ON posthog_property_mappings(workspace_id);
CREATE INDEX idx_posthog_property_mappings_type
    ON posthog_property_mappings(workspace_id, mapping_type);

-- ============================================================
-- 6. Attio Deal Mappings
-- Maps Attio pipeline stages to conversion states.
-- ============================================================

CREATE TABLE attio_deal_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Attio pipeline identifier
    attio_pipeline_id VARCHAR(255) NOT NULL,
    attio_pipeline_name VARCHAR(255),

    -- Attio stage identifier
    attio_stage_id VARCHAR(255) NOT NULL,
    attio_stage_name VARCHAR(255),

    -- What this stage means for Beton
    -- 'won' = deal closed won (counts as conversion)
    -- 'lost' = deal closed lost
    -- 'open' = deal still in progress
    stage_type VARCHAR(10) NOT NULL
        CHECK (stage_type IN ('won', 'lost', 'open')),

    -- For 'won' stages: which revenue field to pull deal value from
    revenue_attribute_id VARCHAR(255),
    revenue_attribute_name VARCHAR(255),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One mapping per (workspace, pipeline, stage)
    UNIQUE (workspace_id, attio_pipeline_id, attio_stage_id)
);

CREATE INDEX idx_attio_deal_mappings_workspace
    ON attio_deal_mappings(workspace_id);

-- ============================================================
-- 7. RLS Policies
-- ============================================================

ALTER TABLE signal_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_cohort_retention ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_conversion_curves ENABLE ROW LEVEL SECURITY;
ALTER TABLE posthog_property_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attio_deal_mappings ENABLE ROW LEVEL SECURITY;

-- Signal Analytics Snapshots
CREATE POLICY "signal_analytics_snapshots_select"
    ON signal_analytics_snapshots FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_analytics_snapshots_insert"
    ON signal_analytics_snapshots FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_analytics_snapshots_update"
    ON signal_analytics_snapshots FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_analytics_snapshots_delete"
    ON signal_analytics_snapshots FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- Signal Cohort Retention
CREATE POLICY "signal_cohort_retention_select"
    ON signal_cohort_retention FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_cohort_retention_insert"
    ON signal_cohort_retention FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_cohort_retention_update"
    ON signal_cohort_retention FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_cohort_retention_delete"
    ON signal_cohort_retention FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- Signal Conversion Curves
CREATE POLICY "signal_conversion_curves_select"
    ON signal_conversion_curves FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_conversion_curves_insert"
    ON signal_conversion_curves FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_conversion_curves_update"
    ON signal_conversion_curves FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_conversion_curves_delete"
    ON signal_conversion_curves FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- PostHog Property Mappings
CREATE POLICY "posthog_property_mappings_select"
    ON posthog_property_mappings FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "posthog_property_mappings_insert"
    ON posthog_property_mappings FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "posthog_property_mappings_update"
    ON posthog_property_mappings FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "posthog_property_mappings_delete"
    ON posthog_property_mappings FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- Attio Deal Mappings
CREATE POLICY "attio_deal_mappings_select"
    ON attio_deal_mappings FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "attio_deal_mappings_insert"
    ON attio_deal_mappings FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "attio_deal_mappings_update"
    ON attio_deal_mappings FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "attio_deal_mappings_delete"
    ON attio_deal_mappings FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================================
-- 8. Triggers for updated_at
-- ============================================================

CREATE TRIGGER update_signal_analytics_snapshots_updated_at
    BEFORE UPDATE ON signal_analytics_snapshots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signal_cohort_retention_updated_at
    BEFORE UPDATE ON signal_cohort_retention
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signal_conversion_curves_updated_at
    BEFORE UPDATE ON signal_conversion_curves
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posthog_property_mappings_updated_at
    BEFORE UPDATE ON posthog_property_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attio_deal_mappings_updated_at
    BEFORE UPDATE ON attio_deal_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
