-- Migration: 018_integration_definitions
-- Description: Integration definitions registry — single source of truth for
--   all integrations. Drives both the setup wizard and the settings page.
-- Created: 2026-02-22

-- ============================================
-- TABLE: integration_definitions
-- Global read-only registry of supported integrations.
-- Not workspace-scoped — same definitions for all tenants.
-- ============================================

CREATE TABLE integration_definitions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Identity
    name TEXT NOT NULL UNIQUE,              -- 'posthog', 'attio', 'firecrawl', etc.
    display_name TEXT NOT NULL,             -- 'PostHog', 'Attio', 'Firecrawl'
    description TEXT NOT NULL DEFAULT '',   -- Short description for settings cards

    -- Classification
    category TEXT NOT NULL,                 -- 'data_source', 'crm', 'billing', 'enrichment', 'web_scraping'

    -- Brand icons (Brandfetch CDN)
    icon_url TEXT,                          -- Dark theme icon URL
    icon_url_light TEXT,                    -- Light theme icon URL

    -- Wizard behaviour
    required BOOLEAN NOT NULL DEFAULT false,       -- Must be connected before setup is complete
    display_order INTEGER NOT NULL DEFAULT 0,      -- Sort order in wizard and settings
    setup_step_key TEXT,                           -- Maps to wizard step component; NULL = no onboarding step
    supports_self_hosted BOOLEAN NOT NULL DEFAULT false,  -- Show cloud/self-hosted toggle

    -- Metadata (documentation only — not used for dynamic form generation yet)
    config_schema JSONB,                   -- JSON Schema describing extra config fields

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RLS: Public read, admin-only write
-- ============================================

ALTER TABLE integration_definitions ENABLE ROW LEVEL SECURITY;

-- Anyone can read definitions (they are not workspace-specific)
CREATE POLICY "Anyone can read integration definitions"
    ON integration_definitions FOR SELECT
    USING (true);

-- No INSERT/UPDATE/DELETE policies = only service role can modify

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE TRIGGER update_integration_definitions_updated_at
    BEFORE UPDATE ON integration_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA
-- ============================================

INSERT INTO integration_definitions (name, display_name, description, category, icon_url, icon_url_light, required, display_order, setup_step_key, supports_self_hosted, config_schema)
VALUES
    (
        'posthog',
        'PostHog',
        'Product analytics and event tracking',
        'data_source',
        'https://cdn.brandfetch.io/id2veLU_gI/theme/dark/symbol.svg',
        'https://cdn.brandfetch.io/id2veLU_gI/theme/light/symbol.svg',
        true,
        10,
        'posthog',
        true,
        '{"type": "object", "properties": {"region": {"type": "string", "enum": ["us", "eu"], "description": "PostHog cloud region"}, "base_url": {"type": "string", "format": "uri", "description": "Self-hosted instance URL"}}, "description": "PostHog connection settings"}'::jsonb
    ),
    (
        'attio',
        'Attio',
        'CRM for managing companies, contacts, and deals',
        'crm',
        'https://cdn.brandfetch.io/idZA7HYRWK/theme/dark/symbol.svg',
        'https://cdn.brandfetch.io/idZA7HYRWK/theme/light/symbol.svg',
        true,
        20,
        'attio',
        false,
        null
    ),
    (
        'stripe',
        'Stripe',
        'Payment processing and subscription billing',
        'billing',
        'https://cdn.brandfetch.io/idxAg10C0L/theme/dark/logo.svg',
        'https://cdn.brandfetch.io/idxAg10C0L/theme/light/logo.svg',
        false,
        30,
        null,
        false,
        null
    ),
    (
        'apollo',
        'Apollo',
        'Firmographic and contact enrichment data',
        'enrichment',
        'https://cdn.brandfetch.io/ideEin4YhC/theme/dark/logo.svg',
        'https://cdn.brandfetch.io/ideEin4YhC/theme/light/logo.svg',
        false,
        40,
        null,
        false,
        null
    ),
    (
        'firecrawl',
        'Firecrawl',
        'Web scraping and AI-powered data extraction',
        'web_scraping',
        'https://cdn.brandfetch.io/idfR2SHJgu/w/400/h/400/theme/dark/icon.jpeg',
        'https://cdn.brandfetch.io/idfR2SHJgu/w/400/h/400/theme/light/icon.jpeg',
        false,
        50,
        'firecrawl',
        true,
        '{"type": "object", "properties": {"proxy_tier": {"type": "string", "enum": ["none", "basic", "stealth"], "default": "none", "description": "Proxy tier for web scraping"}, "base_url": {"type": "string", "format": "uri", "description": "Self-hosted instance URL"}}, "description": "Firecrawl connection settings"}'::jsonb
    );
