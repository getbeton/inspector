-- Migration: Extend signal_definitions to receive inspector-ml-backend agent payloads.
--
-- The agent's `store_candidate_signal` tool emits richer metadata than the
-- manual signal-creation form: a parameterized HogQL `query_template`, a
-- `review_decision`, `promotion_evidence`, and lifecycle status. These columns
-- are nullable so manual rows keep working unchanged; agent rows leave
-- `event_name` / `condition_*` / `time_window_days` NULL and use
-- `query_template` + `parameter_set` instead.

ALTER TABLE public.signal_definitions
    ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'agent')),
    ADD COLUMN entity_grain TEXT NOT NULL DEFAULT 'distinct_id',
    ADD COLUMN target_event TEXT,
    ADD COLUMN time_window TEXT,
    ADD COLUMN comparison_baseline TEXT,
    ADD COLUMN query_template TEXT,
    ADD COLUMN parameter_set JSONB,
    ADD COLUMN interpretation TEXT,
    ADD COLUMN review_decision JSONB,
    ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('candidate', 'promoted', 'rejected', 'active')),
    ADD COLUMN promotion_evidence JSONB,
    ADD COLUMN created_by TEXT;

-- Allow agent rows that only have a query_template (no single event name).
ALTER TABLE public.signal_definitions
    ALTER COLUMN event_name DROP NOT NULL;

ALTER TABLE public.signal_definitions
    ADD CONSTRAINT signal_definitions_query_or_event
    CHECK (event_name IS NOT NULL OR query_template IS NOT NULL);

-- Agent definitions are identified by (workspace_id, name). Manual definitions
-- continue to use the existing unique (workspace_id, type) index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_definitions_workspace_name
    ON public.signal_definitions (workspace_id, name)
    WHERE source = 'agent';
