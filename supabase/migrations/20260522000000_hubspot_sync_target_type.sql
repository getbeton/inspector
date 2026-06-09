-- Add 'hubspot' to the signal sync-target type enum.
--
-- PR #91 introduced HubSpot as a signal destination (VALID_TARGET_TYPES += hubspot,
-- the cron sync-signals hubspot branch, and the signals/new destination picker), but
-- the `sync_target_type` enum backing signal_sync_targets.target_type only had
-- 'posthog_cohort' and 'attio_list'. Without this value, attaching a HubSpot target
-- via PATCH /api/signals/custom fails with: invalid input value for enum
-- sync_target_type: "hubspot".
--
-- ADD VALUE IF NOT EXISTS is idempotent and must run outside a transaction block.

ALTER TYPE sync_target_type ADD VALUE IF NOT EXISTS 'hubspot';
