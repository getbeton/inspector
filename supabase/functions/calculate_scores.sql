-- Database Functions for Score Calculations
-- These can be called via supabase.rpc() from the Next.js API

-- ============================================
-- FUNCTION: Calculate Health Score
-- Weighted scoring with recency decay
-- ============================================

CREATE OR REPLACE FUNCTION calculate_health_score(
    p_account_id UUID,
    p_workspace_id UUID,
    p_lookback_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    score NUMERIC,
    component_scores JSONB,
    signal_count INTEGER
) AS $$
DECLARE
    v_total_score NUMERIC := 0;
    v_components JSONB := '{}';
    v_count INTEGER := 0;
    v_fit_multiplier NUMERIC := 1.0;
    v_fit_score NUMERIC;
BEGIN
    -- Get fit score for multiplier
    SELECT a.fit_score INTO v_fit_score
    FROM accounts a
    WHERE a.id = p_account_id AND a.workspace_id = p_workspace_id;

    -- Calculate fit multiplier
    IF v_fit_score >= 0.8 THEN
        v_fit_multiplier := 1.5;  -- ICP Match
    ELSIF v_fit_score >= 0.5 THEN
        v_fit_multiplier := 1.0;  -- Near ICP
    ELSE
        v_fit_multiplier := 0.5;  -- Poor Fit
    END IF;

    -- Calculate weighted signal scores with recency decay
    WITH signal_scores AS (
        SELECT
            s.type,
            s.value,
            s.timestamp,
            -- Recency decay: newer signals have more weight
            GREATEST(0, 1 - EXTRACT(DAY FROM NOW() - s.timestamp)::NUMERIC / p_lookback_days) as recency_weight,
            -- Signal type weights (configurable)
            CASE s.type
                WHEN 'usage_spike' THEN 15
                WHEN 'director_signup' THEN 12
                WHEN 'invites_sent' THEN 10
                WHEN 'high_nps' THEN 10
                WHEN 'upgrade_page_visit' THEN 8
                WHEN 'new_department_user' THEN 7
                WHEN 'usage_drop' THEN -15
                WHEN 'low_nps' THEN -10
                WHEN 'inactivity' THEN -12
                WHEN 'trial_ending' THEN -8
                WHEN 'arr_decrease' THEN -10
                ELSE 5
            END as type_weight
        FROM signals s
        WHERE s.account_id = p_account_id
        AND s.workspace_id = p_workspace_id
        AND s.timestamp >= NOW() - (p_lookback_days || ' days')::INTERVAL
    ),
    aggregated AS (
        SELECT
            type,
            SUM(value * recency_weight * type_weight) as weighted_score,
            COUNT(*) as signal_count
        FROM signal_scores
        GROUP BY type
    )
    SELECT
        COALESCE(SUM(a.weighted_score), 0),
        jsonb_object_agg(a.type, a.weighted_score),
        COALESCE(SUM(a.signal_count)::INTEGER, 0)
    INTO v_total_score, v_components, v_count
    FROM aggregated a;

    -- Apply fit multiplier and normalize to 0-100
    v_total_score := LEAST(100, GREATEST(0, (v_total_score * v_fit_multiplier / 10) + 50));

    RETURN QUERY SELECT v_total_score, v_components, v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Calculate Expansion Score
-- Sum of expansion-category signals
-- ============================================

CREATE OR REPLACE FUNCTION calculate_expansion_score(
    p_account_id UUID,
    p_workspace_id UUID,
    p_lookback_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    score NUMERIC,
    expansion_signals JSONB
) AS $$
DECLARE
    v_score NUMERIC := 0;
    v_signals JSONB := '[]';
BEGIN
    WITH expansion_signals AS (
        SELECT
            s.type,
            s.value,
            s.timestamp,
            GREATEST(0, 1 - EXTRACT(DAY FROM NOW() - s.timestamp)::NUMERIC / p_lookback_days) as recency_weight
        FROM signals s
        WHERE s.account_id = p_account_id
        AND s.workspace_id = p_workspace_id
        AND s.timestamp >= NOW() - (p_lookback_days || ' days')::INTERVAL
        AND s.type IN (
            'usage_spike', 'director_signup', 'invites_sent',
            'high_nps', 'upgrade_page_visit', 'new_department_user',
            'nearing_paywall', 'approaching_seat_limit'
        )
    )
    SELECT
        LEAST(100, COALESCE(SUM(value * recency_weight * 10), 0)),
        COALESCE(jsonb_agg(jsonb_build_object(
            'type', type,
            'value', value,
            'timestamp', timestamp
        )), '[]'::jsonb)
    INTO v_score, v_signals
    FROM expansion_signals;

    RETURN QUERY SELECT v_score, v_signals;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Calculate Churn Risk Score
-- Sum of churn-risk-category signals
-- ============================================

CREATE OR REPLACE FUNCTION calculate_churn_risk_score(
    p_account_id UUID,
    p_workspace_id UUID,
    p_lookback_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    score NUMERIC,
    risk_signals JSONB
) AS $$
DECLARE
    v_score NUMERIC := 0;
    v_signals JSONB := '[]';
BEGIN
    WITH risk_signals AS (
        SELECT
            s.type,
            s.value,
            s.timestamp,
            GREATEST(0, 1 - EXTRACT(DAY FROM NOW() - s.timestamp)::NUMERIC / p_lookback_days) as recency_weight
        FROM signals s
        WHERE s.account_id = p_account_id
        AND s.workspace_id = p_workspace_id
        AND s.timestamp >= NOW() - (p_lookback_days || ' days')::INTERVAL
        AND s.type IN (
            'usage_drop', 'low_nps', 'inactivity',
            'usage_wow_decline', 'trial_ending', 'health_score_decrease',
            'arr_decrease', 'future_cancellation'
        )
    )
    SELECT
        LEAST(100, COALESCE(SUM(ABS(value) * recency_weight * 10), 0)),
        COALESCE(jsonb_agg(jsonb_build_object(
            'type', type,
            'value', value,
            'timestamp', timestamp
        )), '[]'::jsonb)
    INTO v_score, v_signals
    FROM risk_signals;

    RETURN QUERY SELECT v_score, v_signals;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get Dashboard Metrics
-- Aggregated metrics for the dashboard
-- ============================================

CREATE OR REPLACE FUNCTION get_dashboard_metrics(
    p_workspace_id UUID,
    p_lookback_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_accounts BIGINT,
    active_accounts BIGINT,
    total_signals BIGINT,
    signals_this_period BIGINT,
    avg_health_score NUMERIC,
    total_arr NUMERIC,
    expansion_opportunities BIGINT,
    churn_risks BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH account_stats AS (
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'active') as active,
            AVG(health_score) as avg_health,
            SUM(arr) as total_arr
        FROM accounts
        WHERE workspace_id = p_workspace_id
    ),
    signal_stats AS (
        SELECT
            COUNT(*) as total_signals,
            COUNT(*) FILTER (WHERE timestamp >= NOW() - (p_lookback_days || ' days')::INTERVAL) as recent_signals
        FROM signals
        WHERE workspace_id = p_workspace_id
    ),
    opportunity_stats AS (
        SELECT
            COUNT(*) FILTER (WHERE stage IN ('detected', 'qualified') AND value > 0) as expansion,
            COUNT(*) FILTER (WHERE stage IN ('detected', 'qualified') AND value < 0) as churn
        FROM opportunities
        WHERE workspace_id = p_workspace_id
        AND created_at >= NOW() - (p_lookback_days || ' days')::INTERVAL
    )
    SELECT
        a.total,
        a.active,
        s.total_signals,
        s.recent_signals,
        COALESCE(a.avg_health, 0),
        COALESCE(a.total_arr, 0),
        COALESCE(o.expansion, 0),
        COALESCE(o.churn, 0)
    FROM account_stats a
    CROSS JOIN signal_stats s
    CROSS JOIN opportunity_stats o;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get Signal Types Summary
-- Signal counts by type for dashboard
-- ============================================

CREATE OR REPLACE FUNCTION get_signal_types_summary(
    p_workspace_id UUID,
    p_lookback_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    signal_type VARCHAR,
    count BIGINT,
    avg_value NUMERIC,
    latest_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.type::VARCHAR,
        COUNT(*),
        AVG(s.value),
        MAX(s.timestamp)
    FROM signals s
    WHERE s.workspace_id = p_workspace_id
    AND s.timestamp >= NOW() - (p_lookback_days || ' days')::INTERVAL
    GROUP BY s.type
    ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get Concrete Grade
-- Returns M100/M75/M50/M25/M10 grade for a score
-- ============================================

CREATE OR REPLACE FUNCTION get_concrete_grade(p_score NUMERIC)
RETURNS TABLE (
    grade VARCHAR,
    label VARCHAR,
    color VARCHAR
) AS $$
BEGIN
    IF p_score >= 80 THEN
        RETURN QUERY SELECT 'M100'::VARCHAR, 'Premium Grade'::VARCHAR, '#10b981'::VARCHAR;
    ELSIF p_score >= 60 THEN
        RETURN QUERY SELECT 'M75'::VARCHAR, 'Good Quality'::VARCHAR, '#3b82f6'::VARCHAR;
    ELSIF p_score >= 40 THEN
        RETURN QUERY SELECT 'M50'::VARCHAR, 'Standard'::VARCHAR, '#f59e0b'::VARCHAR;
    ELSIF p_score >= 20 THEN
        RETURN QUERY SELECT 'M25'::VARCHAR, 'Below Standard'::VARCHAR, '#ef4444'::VARCHAR;
    ELSE
        RETURN QUERY SELECT 'M10'::VARCHAR, 'Poor Quality'::VARCHAR, '#991b1b'::VARCHAR;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
