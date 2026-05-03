-- Migration: widen signal_definitions unique index from partial → unconditional
--
-- Why:
-- 20260424120000_extend_signal_definitions_for_agent created
--   CREATE UNIQUE INDEX idx_signal_definitions_workspace_name
--     ON signal_definitions (workspace_id, name)
--     WHERE source = 'agent'
-- so manual rows could keep duplicate names. PostgREST's `upsert(onConflict:
-- 'workspace_id,name')` then routes through this partial index, which it
-- doesn't always match by predicate — agent retries with the same candidate
-- can fall through to a unique-violation 500 instead of an idempotent upsert.
--
-- The existing (workspace_id, type) unique still keeps manual signals
-- distinguishable (manual rows always have a non-null `type` derived from the
-- form selection; agent rows use `type='agent:<name>'` which is unique-by-name
-- already). Widening (workspace_id, name) to cover all rows is therefore safe
-- AND fixes the agent-retry idempotency.
--
-- Backfill: dedupe any existing (workspace_id, name) collisions so the new
-- index can be built. Strategy: keep the oldest row, rename the rest by
-- appending " (n)" to make them unique. Pure additive — no data loss; user
-- can rename back if desired.

BEGIN;

-- 1. Defensive backfill — rename collisions before index build.
WITH ranked AS (
    SELECT
        id,
        name,
        workspace_id,
        ROW_NUMBER() OVER (
            PARTITION BY workspace_id, name
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM public.signal_definitions
)
UPDATE public.signal_definitions sd
SET name = sd.name || ' (' || ranked.rn || ')'
FROM ranked
WHERE sd.id = ranked.id
    AND ranked.rn > 1;

-- 2. Drop the partial index introduced in 20260424120000.
DROP INDEX IF EXISTS public.idx_signal_definitions_workspace_name;

-- 3. Recreate as unconditional unique. Same name to keep PostgREST's
--    `onConflict: workspace_id,name` matching trivially via the index name.
CREATE UNIQUE INDEX idx_signal_definitions_workspace_name
    ON public.signal_definitions (workspace_id, name);

COMMIT;
