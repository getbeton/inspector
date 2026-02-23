-- Migration: 021_slack_integration
-- Description: Register Slack as a supported integration in the definitions registry.
--   Slack is a notification-category integration (new category) that sends
--   signal alerts to a configured Slack channel via Block Kit messages.
-- Created: 2026-02-23

-- ============================================
-- SEED: Slack integration definition
-- ============================================
-- Uses ON CONFLICT DO NOTHING for idempotency (safe to re-run).

INSERT INTO integration_definitions (
    name,
    display_name,
    description,
    category,
    icon_url,
    icon_url_light,
    required,
    display_order,
    setup_step_key,
    supports_self_hosted,
    config_schema
) VALUES (
    'slack',
    'Slack',
    'Send signal notifications to a Slack channel when product usage signals are detected.',
    'notification',
    'https://cdn.brandfetch.io/idSUrLOWbH/theme/dark/symbol.svg',
    'https://cdn.brandfetch.io/idSUrLOWbH/theme/light/symbol.svg',
    false,
    70,
    'slack',
    false,
    '{
        "type": "object",
        "description": "Slack notification configuration",
        "properties": {
            "slack_team_id":              { "type": "string", "description": "Slack workspace ID (T0123ABC)" },
            "slack_team_name":            { "type": "string", "description": "Slack workspace display name" },
            "slack_bot_user_id":          { "type": "string", "description": "Bot user ID installed in the workspace" },
            "slack_channel_id":           { "type": "string", "description": "Target channel for signal notifications" },
            "slack_channel_name":         { "type": "string", "description": "Human-readable channel name (#signals)" },
            "installed_by_slack_user_id": { "type": "string", "description": "Slack user who authorized the app" },
            "enabled_signal_types":       { "type": "array",  "items": { "type": "string" }, "description": "Signal types that trigger notifications" }
        }
    }'::jsonb
) ON CONFLICT (name) DO NOTHING;
