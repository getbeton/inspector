-- Migration: Drop legacy heuristics scoring layer.
--
-- Inspector no longer computes account-level health/expansion/churn scores.
-- Discovery now lives in inspector-ml-backend (agent), which writes richer
-- `signal_definitions` rows. Inspector's daily cron tracks all definitions
-- into `signal_aggregates`. The scoring engine and its DB surface go away.
--
-- Objects dropped:
--   * accounts.health_score column
--   * heuristic_scores table
--   * calculate_health_score(uuid, uuid, integer)
--   * calculate_expansion_score(uuid, uuid, integer)
--   * calculate_churn_risk_score(uuid, uuid, integer)
--   * get_concrete_grade(numeric)
--   * get_dashboard_metrics(uuid, integer) -- referenced accounts.health_score

-- Drop dashboard metrics function first (depends on accounts.health_score).
DROP FUNCTION IF EXISTS public.get_dashboard_metrics(uuid, integer);

-- Drop scoring functions.
DROP FUNCTION IF EXISTS public.calculate_health_score(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.calculate_expansion_score(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.calculate_churn_risk_score(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.get_concrete_grade(numeric);

-- Drop scores cache table (has FK to accounts — dropped before column).
DROP TABLE IF EXISTS public.heuristic_scores;

-- Finally drop the account-level cached score column.
ALTER TABLE public.accounts DROP COLUMN IF EXISTS health_score;
