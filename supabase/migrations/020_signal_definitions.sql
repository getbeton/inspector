-- Migration 020: Signal Definitions
--
-- Separates signal DEFINITIONS (what to detect) from signal OCCURRENCES (when detected).
-- The existing `signals` table conflated both concepts — custom signals stored definition
-- metadata in `details` JSONB and hacked `account_id: workspace_id` to bypass the FK.
--
-- After this migration:
-- - `signal_definitions` holds what-to-detect (custom signal configs)
-- - `signals` holds when-it-fired (real occurrences with real account_ids)
-- - `signal_sync_configs` references `signal_definition_id` instead of `signal_id`
-- - `signal_aggregates` gains an optional `signal_definition_id` FK

-- ============================================================
-- 1. Create signal_definitions table
-- ============================================================

CREATE TABLE signal_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    type VARCHAR(100) NOT NULL,          -- e.g. "custom:pricing_page_visit"
    event_name VARCHAR(255) NOT NULL,    -- PostHog event to match
    condition_operator VARCHAR(10) NOT NULL DEFAULT 'gte',
    condition_value NUMERIC(12, 4) NOT NULL DEFAULT 1,
    time_window_days INTEGER NOT NULL DEFAULT 7,
    conversion_event VARCHAR(255),       -- optional conversion tracking

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signal_definitions_workspace ON signal_definitions(workspace_id);
CREATE UNIQUE INDEX idx_signal_definitions_type ON signal_definitions(workspace_id, type);

-- RLS
ALTER TABLE signal_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_definitions_select"
    ON signal_definitions FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_definitions_insert"
    ON signal_definitions FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_definitions_update"
    ON signal_definitions FOR UPDATE
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "signal_definitions_delete"
    ON signal_definitions FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================================
-- 2. Migrate existing custom signal definitions
-- ============================================================

INSERT INTO signal_definitions (
    workspace_id, name, description, type, event_name,
    condition_operator, condition_value, time_window_days,
    conversion_event, created_at
)
SELECT
    s.workspace_id,
    COALESCE((s.details->>'name')::text, s.type),
    COALESCE((s.details->>'description')::text, ''),
    s.type,
    COALESCE((s.details->>'event_name')::text, replace(s.type, 'custom:', '')),
    COALESCE((s.details->>'condition_operator')::text, 'gte'),
    COALESCE((s.details->>'condition_value')::numeric, 1),
    COALESCE((s.details->>'time_window_days')::integer, 7),
    (s.details->>'conversion_event')::text,
    s.created_at
FROM signals s
WHERE s.source = 'manual';

-- ============================================================
-- 3. Update signal_sync_configs FK
-- ============================================================

-- Add new FK column
ALTER TABLE signal_sync_configs
    ADD COLUMN signal_definition_id UUID REFERENCES signal_definitions(id) ON DELETE CASCADE;

-- Migrate existing FKs: match by type + workspace_id
UPDATE signal_sync_configs sc
SET signal_definition_id = sd.id
FROM signal_definitions sd
JOIN signals s ON s.type = sd.type AND s.workspace_id = sd.workspace_id
WHERE sc.signal_id = s.id;

-- For any sync configs that couldn't be migrated, delete them
-- (they reference signals that weren't manual/custom)
DELETE FROM signal_sync_configs WHERE signal_definition_id IS NULL;

-- Drop old FK column and make new one NOT NULL
ALTER TABLE signal_sync_configs DROP COLUMN signal_id;
ALTER TABLE signal_sync_configs
    ALTER COLUMN signal_definition_id SET NOT NULL;

-- Re-create unique constraint on the new FK
ALTER TABLE signal_sync_configs
    ADD CONSTRAINT signal_sync_configs_definition_unique UNIQUE (signal_definition_id);

-- ============================================================
-- 4. Clean up signals table
-- ============================================================

-- Remove custom signal "definition" rows (they're now in signal_definitions)
DELETE FROM signals WHERE source = 'manual';

-- ============================================================
-- 5. Update signal_aggregates with optional FK
-- ============================================================

ALTER TABLE signal_aggregates
    ADD COLUMN signal_definition_id UUID REFERENCES signal_definitions(id) ON DELETE CASCADE;

-- Backfill from type string match
UPDATE signal_aggregates sa
SET signal_definition_id = sd.id
FROM signal_definitions sd
WHERE sa.signal_type = sd.type AND sa.workspace_id = sd.workspace_id;
