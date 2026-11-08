# beton-inspector — staging → prod release plan

**Date drafted:** 2026-05-01
**Drafter:** Claude / daily-planner
**Status:** Pre-flight — verification still required before promote

---

## What's shipping (25 commits, 3 migrations)

Four merged PRs sit on `staging` ahead of `main`:

| PR | Subject | Risk |
|----|---------|------|
| #76 | `feature/BETON-field-mapping-unified` | low — UI + writer; Vlad verified field mapping works |
| #77 | `feature/BETON-entity-linking` | low — extends mapping with cross-record links |
| #79 | `feature/agent-signal-discovery` | **high — uncertain end-to-end on staging** |
| #81 | `hotfix/agent-api-url-staging-fallback` | low — env-var hardening so staging cannot fall back to prod ml-backend |

Migrations introduced (must run before code merge to `main` if `main` is gated by Supabase prod):

1. `20260424120000_extend_signal_definitions_for_agent.sql` — adds `source`, `entity_grain`, `target_event`, `time_window`, `comparison_baseline`, `query_template`, `parameter_set`, `interpretation`, `review_decision`, `status`, `promotion_evidence`, `created_by` to `signal_definitions`. Drops NOT NULL on `event_name`. Adds `signal_definitions_query_or_event` CHECK. Adds partial unique index `(workspace_id, name) WHERE source='agent'`.
2. `20260424120001_drop_heuristics.sql` — removes the old in-process heuristics machinery (refactor: discovery now lives in ml-backend).
3. `20260424131509_field_mappings_links.sql` — supports entity-linking persistence.

All three are additive or are deletions of code that has no longer-used dependents. Existing manual signal definitions keep working (new columns nullable; check constraint passes for any row with `event_name`).

---

## The flow we're shipping (so the verification list makes sense)

```
[Inspector UI mount /memory]
    └── AgentService.triggerAnalysisIfNotRecentlyRun(workspaceId)
        └── (idempotency: skip if workspace has a session in created/running/completed within 24h)
        └── triggerAnalysis(workspaceId)
              ├── createSession(sessionId, workspaceId)              ─► workspace_agent_sessions row (status=created)
              ├── POST {AGENT_API_URL}/apps/upsell_agent/users/.../sessions/...   (ADK session bootstrap)
              └── POST {AGENT_API_URL}/run                            (start agent run)
[ml-backend agent runs]
    └── calls back to Inspector callback URL
        ├── /api/sql-proxy, /api/list-tables, etc. (PostHog SDK proxy)
        └── POST /api/agent/signals  (when store_candidate_signal promotes)
              └── upsert into signal_definitions WHERE source='agent'
[Vercel Cron daily 06:00 UTC]
    └── /api/cron/signal-detection
        └── for each workspace × each active signal_definitions row:
              evaluateDefinition() → upsertSignalMetrics() → signal_aggregates
```

---

## Pre-promote verification on staging (REQUIRED — gate before merge to `main`)

Field mapping is verified by Vlad. Three uncertain links remain. Run these in order on the staging Supabase project, against a real workspace that has been through onboarding on the staging deploy.

### Link 1 — agent gets triggered

Goal: confirm `triggerAnalysis` actually fires when a user lands on `/memory` after staging onboarding.

```sql
-- Most recent agent sessions across all staging workspaces, last 7 days
select session_id, workspace_id, status, error_message, created_at, updated_at
  from workspace_agent_sessions
 where created_at > now() - interval '7 days'
 order by created_at desc
 limit 20;
```

**Expected:** at least one row with `status` in (`created`, `running`, `completed`). If `error_message` is populated, read it — most likely cause is `AGENT_API_URL` mis-set on the staging Vercel project (PR #81 hardened this; the legacy `API_URL` fallback was removed in `38b3b64`).

**If 0 rows:**
- Check Vercel logs for `[AgentService]` — look for `Triggering agent analysis for workspace: ...` or the `AGENT_API_URL is not set` throw.
- Check that the post-onboarding UI on `/memory` is actually invoking `triggerAnalysisIfNotRecentlyRun` (grep `app/(...)`/page.tsx for the call site if unsure).

### Link 2 — agent reaches Inspector callbacks

Goal: confirm the ml-backend agent is actually running its tools and hitting Inspector's proxy routes.

Vercel staging logs filter:
- `[API][Agent][Sql-Proxy]`
- `[API][Agent][Signals]`
- `[API][Agent][List-Tables]`

**Expected:** within ~30s of a fresh trigger, requests should arrive at `/api/agent/sql-proxy` (or whichever discovery tool the agent uses first). Each bears `x-agent-secret` and `session_id` in body.

**If absent:** ml-backend isn't reaching Inspector. Possible causes:
- `inspector_callback_url` in the agent's payload context is wrong (defaults to `NEXT_PUBLIC_VERCEL_URL` → preview-domain that's behind protection). Confirm the staging Vercel project has `NEXT_PUBLIC_APP_URL` set to a publicly-reachable hostname.
- ml-backend service is down — check Cloud Run / Railway deploy status.
- `x-agent-secret` mismatch between Inspector and ml-backend env.

### Link 3 — signals get written

Goal: confirm `signal_definitions` rows with `source='agent'` are appearing.

```sql
-- New agent-emitted signal definitions on staging (last 7 days)
select id, workspace_id, name, status, source, target_event,
       (review_decision->>'promotion_readiness')::boolean as promo_ready,
       created_at
  from signal_definitions
 where source = 'agent'
   and created_at > now() - interval '7 days'
 order by created_at desc
 limit 30;
```

**Expected:** at least a few rows per workspace that completed an agent session. `status` will be `candidate` or `promoted`.

**If 0 rows but Link 1 + Link 2 are green:**
- Agent ran but `store_candidate_signal` never fired → ml-backend agent prompt issue, not Inspector's problem.
- Agent fired the tool but `/api/agent/signals` rejected → check Vercel logs for `[API][Agent][Signals]` 4xx/5xx.
- DB write succeeded but you queried the wrong project. Double-check Supabase URL.

### Link 4 — cron evaluator picks them up

Goal: confirm the daily tracking cron evaluates the agent-emitted definitions and lands metrics.

```sql
-- Did today's cron run?  (look at the most recent batch)
select definition_id, workspace_id, computed_at, match_count
  from signal_aggregates
 where computed_at > now() - interval '36 hours'
 order by computed_at desc
 limit 30;

-- Cross-check: which definitions did NOT get evaluated?
select sd.id, sd.name, sd.source, sd.is_active, sd.status
  from signal_definitions sd
  left join signal_aggregates sa
    on sa.definition_id = sd.id
   and sa.computed_at > now() - interval '36 hours'
 where sd.is_active = true
   and sd.status not in ('rejected','candidate')
   and sa.id is null
   and sd.source = 'agent';
```

**Expected:** every active, non-candidate, non-rejected `agent` definition has a corresponding `signal_aggregates` row in the last 24h. Cron at 06:00 UTC should have populated them this morning.

**If there's a gap:** either (a) cron didn't run (check Vercel Cron dashboard), (b) `evaluateDefinition` errored on the row (check `[Cron Signal Detection]` logs for `definitionsFailed > 0`), or (c) PostHog credentials expired for that workspace.

### Link 5 (sanity) — manual signals still work

Confirm we didn't break the existing path with the migration:

```sql
select count(*) as manual_active
  from signal_definitions
 where source = 'manual' and is_active = true;

select count(*) filter (where computed_at > now() - interval '36 hours') as recent_manual_aggregates
  from signal_aggregates sa
  join signal_definitions sd on sd.id = sa.definition_id
 where sd.source = 'manual';
```

Manual count should match what was on prod yesterday; recent aggregates should be > 0.

---

## Promote sequence (after all 5 links are green)

1. **Run the three migrations on prod Supabase** (in this order — they're already applied to staging Supabase). Use the Supabase dashboard SQL runner or `supabase db push`. Verify each succeeds before the next.
2. **Open PR `staging` → `main`.** Review the diff one more time, looking specifically for any leftover heuristic-engine imports that should have been cleaned up by `drop_heuristics.sql` companion code.
3. **`npm run build` on the merge commit locally** before approving the PR (CLAUDE.md mandate).
4. **Merge.** Vercel deploys `main` → production.
5. **Post-promote smoke (within 10 min of deploy):**
   - Hit `/api/cron/signal-detection` manually with `CRON_SECRET` to force a tracking pass; verify response shape matches expectations.
   - Trigger an agent run on a real prod workspace (via UI or admin endpoint). Re-run Link 1 + Link 3 queries on the prod Supabase.
   - Watch `[AgentService]` and `[API][Agent][Signals]` logs in Vercel for the next 30 min.

---

## Rollback plan

**Code rollback** is cheap and reversible:
- Revert the merge commit on `main` → Vercel re-deploys the previous build.
- Old code reads existing `signal_definitions` rows fine because new columns are all nullable; pre-existing manual rows keep working unchanged.

**Migration rollback** is more delicate but rarely needed:
- The migrations are additive. The `signal_definitions_query_or_event` CHECK is the only constraint that could trip up old code if old code tried to insert a row with NULL `event_name`. Old code never did that, so leaving the columns + check in place is safe even if you revert code.
- If something is genuinely wrong at the schema level: write a forward-fixing migration rather than reversing — reversing the unique partial index and column drops is cheap; reversing `ALTER COLUMN event_name DROP NOT NULL` requires backfilling, so don't.

**ml-backend rollback** is independent — Inspector's only contract is `POST /api/agent/signals` (auth via `x-agent-secret`). If we revert ml-backend instead, Inspector continues running cron + serving manual signals; agent signals just stop being created.

---

## Open questions before promote

1. **Are agent runs even firing on staging today?** (Link 1 query — Vlad's primary concern.)
2. **Has any workspace gotten a `signal_definitions(source='agent')` row written end-to-end?** (Link 3 — the actual proof of life.)
3. **Has anything in the cron's `evaluateDefinition` choked on the new `query_template` shape?** (Link 4 — first real production-style test of the new code path.)
4. **`AGENT_API_URL` is set correctly on the prod Vercel project**, distinct from staging? (PR #81 made this strictly required; missing on prod = silent agent failure post-promote.)

If we can't answer 1–3 with green checks today, **don't promote**. The rest of the changeset (field mapping, entity linking, drop-heuristics) is fine to ship regardless, but the agent path is the headline feature and shipping it broken is worse than waiting.

---

## Suggested follow-up

If staging verification turns up red on any link, the next concrete moves are:
- Add a small admin button in the Inspector UI to trigger an agent run for the current workspace (today this is implicit — only fires from `/memory` mount). Makes verification faster.
- Add a `workspace_agent_sessions` view that joins `signal_definitions(source='agent')` count per session — turns the 5 SQL queries above into a one-glance dashboard panel.
- Wire a Sentry alert on `[API][Agent][Signals]` 4xx/5xx and on `triggerAnalysis` throws — so failures surface without us querying.
