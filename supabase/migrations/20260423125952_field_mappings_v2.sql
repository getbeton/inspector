-- Migration: field_mappings v2 — unified, destination-agnostic field mapping table
--
-- Motivation:
-- - Existing attio_field_mappings (migration 002) is orphaned; app uses integration_configs.config_json.field_mappings (JSONB).
-- - Prepare task spec calls for flat relational schema, unified across CRMs (Attio now, HubSpot next).
-- - Source shape needs to support: PostHog person property, PostHog group property, Beton-computed field, formula, static option.
--
-- Design:
-- - One row per (workspace, destination, object, field). Discriminated `source_type` column.
-- - Flat columns (no JSONB) for queryable source data.
-- - Legacy integration_configs.config_json.field_mappings remains readable; backfill runs once, idempotently.

CREATE TABLE IF NOT EXISTS field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    destination VARCHAR(50) NOT NULL,          -- 'attio' | 'hubspot' (future)
    object_id VARCHAR(100) NOT NULL,           -- 'deals' | 'people' | 'companies' | 'workspaces'
    field_id VARCHAR(200) NOT NULL,            -- destination field identifier (Attio slug / HubSpot property name)

    source_type VARCHAR(20) NOT NULL,          -- 'property' | 'formula' | 'option' | 'none'
    source_prop VARCHAR(200),                  -- property id when source_type='property'
    source_prop_kind VARCHAR(30),              -- 'person' | 'group_org' | 'beton_computed' when source_type='property'
    source_transform VARCHAR(100),             -- optional display hint (e.g. '* 12')
    source_formula TEXT,                       -- expression when source_type='formula'
    source_option VARCHAR(500),                -- option value when source_type='option' (for select fields)
    match_on VARCHAR(100),                     -- match key for record-type fields (existing pattern)

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (workspace_id, destination, object_id, field_id),

    CHECK (source_type IN ('property', 'formula', 'option', 'none')),
    CHECK (
        (source_type = 'property' AND source_prop IS NOT NULL AND source_prop_kind IS NOT NULL)
        OR (source_type = 'formula' AND source_formula IS NOT NULL)
        OR (source_type = 'option' AND source_option IS NOT NULL)
        OR (source_type = 'none')
    )
);

CREATE INDEX IF NOT EXISTS idx_field_mappings_workspace_dest
    ON field_mappings(workspace_id, destination);

CREATE INDEX IF NOT EXISTS idx_field_mappings_dest_object
    ON field_mappings(workspace_id, destination, object_id);

-- RLS
ALTER TABLE field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view field_mappings"
    ON field_mappings FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Users can manage field_mappings"
    ON field_mappings FOR ALL
    USING (workspace_id IN (SELECT get_user_workspaces()));

-- Auto-update updated_at
CREATE TRIGGER update_field_mappings_updated_at
    BEFORE UPDATE ON field_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Backfill from legacy integration_configs.config_json.field_mappings
-- ============================================================
-- Existing shape: {betonField: attioSlug}, e.g. {"health_score":"beton_score","domain":"domain"}
-- These map Beton-computed fields on the 'companies' Attio object.
-- Convert each pair to a row with source_type='property', source_prop_kind='beton_computed'.
--
-- Idempotent via ON CONFLICT DO NOTHING — reruns will not clobber manually-edited rows.

INSERT INTO field_mappings (
    workspace_id, destination, object_id, field_id,
    source_type, source_prop, source_prop_kind
)
SELECT
    ic.workspace_id,
    'attio' AS destination,
    'companies' AS object_id,
    pair.value AS field_id,
    'property' AS source_type,
    pair.key AS source_prop,
    'beton_computed' AS source_prop_kind
FROM integration_configs ic
CROSS JOIN LATERAL jsonb_each_text(ic.config_json -> 'field_mappings') AS pair
WHERE ic.integration_name = 'attio'
    AND ic.config_json ? 'field_mappings'
    AND jsonb_typeof(ic.config_json -> 'field_mappings') = 'object'
    AND ic.config_json -> 'field_mappings' <> '{}'::jsonb
    AND pair.value IS NOT NULL
    AND pair.value <> ''
ON CONFLICT (workspace_id, destination, object_id, field_id) DO NOTHING;

COMMENT ON TABLE field_mappings IS
    'Unified field-mapping storage for CRM destinations (Attio, HubSpot). One row per (workspace, destination, object, field).';
COMMENT ON COLUMN field_mappings.source_type IS
    'Discriminator: property (maps a source property), formula (expression), option (static select value), none (cleared/required).';
COMMENT ON COLUMN field_mappings.source_prop_kind IS
    'Source scope for source_type=property: person / group_org / beton_computed.';
