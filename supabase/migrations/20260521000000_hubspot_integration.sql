-- Migration: HubSpot integration registry entry
--
-- HubSpot uses the standard `integration_configs` model (one connection per
-- workspace, like Attio/PostHog/Apollo) — no dedicated tables. Credentials live
-- in integration_configs: private-app or OAuth access token in
-- `api_key_encrypted`; refresh token, expiry, hub metadata and per-object sync
-- cursor in `config_json`. This migration only registers the integration so it
-- appears in the setup wizard and settings page.

INSERT INTO integration_definitions (
    name, display_name, description, category,
    icon_url, icon_url_light,
    required, display_order, setup_step_key,
    supports_self_hosted, config_schema
)
VALUES (
    'hubspot',
    'HubSpot',
    'Sync HubSpot CRM contacts, companies, and deals, and write signals back to HubSpot',
    'crm',
    'https://cdn.brandfetch.io/idAa1f1f1f/theme/dark/symbol.svg',
    'https://cdn.brandfetch.io/idAa1f1f1f/theme/light/symbol.svg',
    false,           -- Not required
    25,              -- After Attio (20)
    'hubspot',       -- Maps to wizard step component
    false,           -- Cloud SaaS only
    '{"type": "object", "properties": {"auth_type": {"type": "string", "enum": ["oauth", "private_app"], "default": "private_app"}}, "description": "HubSpot connection settings"}'::jsonb
)
ON CONFLICT (name) DO NOTHING;
