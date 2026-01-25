-- Migration: 007_billing_schema
-- Description: Tables for MTU-based Stripe billing system
-- Created: 2025-01-21
-- Epic: BETON-75 - Implement Stripe billing

-- ============================================
-- ENUMS
-- ============================================

-- Billing status for workspace billing state
CREATE TYPE billing_status AS ENUM (
    'free',           -- Under threshold, no card required
    'card_required',  -- Over threshold, card not linked
    'active',         -- Card linked, billing active
    'past_due',       -- Payment failed
    'cancelled'       -- Subscription cancelled
);

-- Notification types for threshold warnings
CREATE TYPE threshold_notification_type AS ENUM (
    'threshold_90',   -- 90% of free tier used
    'threshold_95',   -- 95% of free tier used
    'threshold_exceeded', -- Over free tier threshold
    'card_linked',    -- Card successfully linked
    'payment_failed', -- Payment failed
    'payment_success' -- Payment succeeded
);

-- Event types for billing audit log
CREATE TYPE billing_event_type AS ENUM (
    'mtu_recorded',
    'threshold_reached',
    'card_linked',
    'card_removed',
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'payment_succeeded',
    'payment_failed',
    'refund_issued',
    'usage_reported'
);

-- ============================================
-- TABLE: workspace_billing
-- Stores billing configuration and state per workspace
-- ============================================

CREATE TABLE workspace_billing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Billing state
    status billing_status NOT NULL DEFAULT 'free',

    -- Stripe references
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    stripe_payment_method_id VARCHAR(255),

    -- MTU thresholds (configurable per workspace for enterprise)
    free_tier_mtu_limit INTEGER NOT NULL DEFAULT 200,

    -- Current billing cycle
    billing_cycle_start TIMESTAMPTZ,
    billing_cycle_end TIMESTAMPTZ,
    current_cycle_mtu INTEGER NOT NULL DEFAULT 0,

    -- Peak MTU in current cycle (for metered billing)
    peak_mtu_this_cycle INTEGER NOT NULL DEFAULT 0,
    peak_mtu_date DATE,

    -- Last threshold notifications sent (to prevent duplicates)
    last_90_threshold_sent_at TIMESTAMPTZ,
    last_95_threshold_sent_at TIMESTAMPTZ,
    last_exceeded_threshold_sent_at TIMESTAMPTZ,

    -- Card details (for UI display - not actual card data)
    card_last_four VARCHAR(4),
    card_brand VARCHAR(50),
    card_exp_month INTEGER,
    card_exp_year INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one billing record per workspace
    CONSTRAINT unique_workspace_billing UNIQUE (workspace_id)
);

-- Indexes for workspace_billing
CREATE INDEX idx_workspace_billing_workspace_id ON workspace_billing(workspace_id);
CREATE INDEX idx_workspace_billing_status ON workspace_billing(status);
CREATE INDEX idx_workspace_billing_stripe_customer ON workspace_billing(stripe_customer_id);
CREATE INDEX idx_workspace_billing_cycle_end ON workspace_billing(billing_cycle_end);

-- Trigger for auto-updating updated_at
CREATE TRIGGER update_workspace_billing_updated_at
    BEFORE UPDATE ON workspace_billing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLE: mtu_tracking
-- Historical MTU counts for billing and analytics
-- ============================================

CREATE TABLE mtu_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- The date this MTU count is for
    tracking_date DATE NOT NULL,

    -- MTU count for this date
    mtu_count INTEGER NOT NULL DEFAULT 0,

    -- Breakdown by source (for analytics)
    mtu_by_source JSONB DEFAULT '{}',  -- e.g., {"posthog": 150, "api": 50}

    -- Billing cycle this belongs to
    billing_cycle_start DATE,
    billing_cycle_end DATE,

    -- Running total for the cycle (denormalized for performance)
    cycle_total_mtu INTEGER,

    -- Was this reported to Stripe?
    reported_to_stripe BOOLEAN DEFAULT FALSE,
    reported_at TIMESTAMPTZ,
    stripe_usage_record_id VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- One record per workspace per day
    CONSTRAINT unique_workspace_date UNIQUE (workspace_id, tracking_date)
);

-- Indexes for mtu_tracking
CREATE INDEX idx_mtu_tracking_workspace_id ON mtu_tracking(workspace_id);
CREATE INDEX idx_mtu_tracking_date ON mtu_tracking(tracking_date);
CREATE INDEX idx_mtu_tracking_workspace_date ON mtu_tracking(workspace_id, tracking_date DESC);
CREATE INDEX idx_mtu_tracking_billing_cycle ON mtu_tracking(workspace_id, billing_cycle_start, billing_cycle_end);
CREATE INDEX idx_mtu_tracking_not_reported ON mtu_tracking(workspace_id) WHERE NOT reported_to_stripe;

-- ============================================
-- TABLE: billing_events
-- Audit log for all billing-related events
-- ============================================

CREATE TABLE billing_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Event details
    event_type billing_event_type NOT NULL,
    event_data JSONB DEFAULT '{}',

    -- Stripe references (if applicable)
    stripe_event_id VARCHAR(255),
    stripe_object_type VARCHAR(100),
    stripe_object_id VARCHAR(255),

    -- User who triggered the event (if applicable)
    user_id UUID,

    -- For correlation with external systems
    idempotency_key VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for billing_events
CREATE INDEX idx_billing_events_workspace_id ON billing_events(workspace_id);
CREATE INDEX idx_billing_events_type ON billing_events(event_type);
CREATE INDEX idx_billing_events_created_at ON billing_events(created_at DESC);
CREATE INDEX idx_billing_events_stripe_event ON billing_events(stripe_event_id);
CREATE INDEX idx_billing_events_idempotency ON billing_events(idempotency_key);

-- ============================================
-- TABLE: threshold_notifications
-- Tracks sent notifications to prevent duplicates
-- ============================================

CREATE TABLE threshold_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Notification details
    notification_type threshold_notification_type NOT NULL,

    -- The billing cycle this notification is for
    billing_cycle_start DATE NOT NULL,

    -- Current MTU when notification was sent
    mtu_at_notification INTEGER,
    threshold_percentage INTEGER,  -- 90, 95, 100+

    -- Delivery details
    sent_to_email VARCHAR(255),
    sent_at TIMESTAMPTZ DEFAULT NOW(),

    -- Email delivery tracking
    email_provider_id VARCHAR(255),  -- Resend message ID
    delivery_status VARCHAR(50) DEFAULT 'sent',  -- sent, delivered, failed, bounced

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate notifications per cycle
    CONSTRAINT unique_notification_per_cycle UNIQUE (workspace_id, notification_type, billing_cycle_start)
);

-- Indexes for threshold_notifications
CREATE INDEX idx_threshold_notifications_workspace_id ON threshold_notifications(workspace_id);
CREATE INDEX idx_threshold_notifications_type ON threshold_notifications(notification_type);
CREATE INDEX idx_threshold_notifications_cycle ON threshold_notifications(billing_cycle_start);

-- ============================================
-- ENABLE RLS ON NEW TABLES
-- ============================================

ALTER TABLE workspace_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtu_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE threshold_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES: workspace_billing
-- Users can view/update billing for their workspaces
-- ============================================

CREATE POLICY "Users can view workspace billing"
    ON workspace_billing FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can update workspace billing"
    ON workspace_billing FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- Note: INSERT and DELETE are handled by service role (Stripe webhooks, system)

-- ============================================
-- RLS POLICIES: mtu_tracking
-- Users can view MTU data for their workspaces
-- ============================================

CREATE POLICY "Users can view workspace mtu tracking"
    ON mtu_tracking FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- Note: INSERT/UPDATE handled by service role (cron jobs, system)

-- ============================================
-- RLS POLICIES: billing_events
-- Users can view billing events for their workspaces
-- ============================================

CREATE POLICY "Users can view workspace billing events"
    ON billing_events FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- Note: INSERT handled by service role (webhooks, system)

-- ============================================
-- RLS POLICIES: threshold_notifications
-- Users can view notifications for their workspaces
-- ============================================

CREATE POLICY "Users can view workspace threshold notifications"
    ON threshold_notifications FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- Note: INSERT handled by service role (notification system)

-- ============================================
-- HELPER FUNCTION: Get current billing cycle MTU
-- ============================================

CREATE OR REPLACE FUNCTION get_current_cycle_mtu(p_workspace_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_total INTEGER;
BEGIN
    SELECT COALESCE(SUM(mtu_count), 0) INTO v_total
    FROM mtu_tracking mt
    JOIN workspace_billing wb ON mt.workspace_id = wb.workspace_id
    WHERE mt.workspace_id = p_workspace_id
    AND mt.tracking_date >= wb.billing_cycle_start::DATE
    AND mt.tracking_date < wb.billing_cycle_end::DATE;

    RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- HELPER FUNCTION: Get MTU threshold percentage
-- ============================================

CREATE OR REPLACE FUNCTION get_mtu_threshold_percentage(p_workspace_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_current_mtu INTEGER;
    v_limit INTEGER;
BEGIN
    SELECT current_cycle_mtu, free_tier_mtu_limit
    INTO v_current_mtu, v_limit
    FROM workspace_billing
    WHERE workspace_id = p_workspace_id;

    IF v_limit IS NULL OR v_limit = 0 THEN
        RETURN 0;
    END IF;

    RETURN (v_current_mtu::NUMERIC / v_limit::NUMERIC) * 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- HELPER FUNCTION: Check if workspace needs card
-- Returns true if over threshold and no card linked
-- ============================================

CREATE OR REPLACE FUNCTION workspace_needs_card(p_workspace_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_billing RECORD;
BEGIN
    SELECT status, current_cycle_mtu, free_tier_mtu_limit, stripe_payment_method_id
    INTO v_billing
    FROM workspace_billing
    WHERE workspace_id = p_workspace_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Needs card if over threshold and no payment method
    RETURN v_billing.current_cycle_mtu >= v_billing.free_tier_mtu_limit
           AND v_billing.stripe_payment_method_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- INITIALIZE BILLING FOR EXISTING WORKSPACES
-- Creates billing records for workspaces that don't have one
-- ============================================

INSERT INTO workspace_billing (workspace_id, status, billing_cycle_start, billing_cycle_end)
SELECT
    id,
    'free',
    DATE_TRUNC('month', NOW()),
    DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
FROM workspaces
WHERE NOT EXISTS (
    SELECT 1 FROM workspace_billing WHERE workspace_billing.workspace_id = workspaces.id
);
