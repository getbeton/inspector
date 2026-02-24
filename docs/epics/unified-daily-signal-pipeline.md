# Epic: Unified Daily Signal Pipeline

> **Status**: Draft
> **Priority**: High
> **Estimated scope**: ~8-10 tasks

## Problem Statement

The current signal system has **four separate cron jobs** on **three different schedules**, creating fragmentation:

| Job | Schedule | What it does |
|-----|----------|--------------|
| Signal Detection | Daily 6 AM | Runs 21 heuristic detectors, stores occurrences in `signals` table |
| Sync Signals | Every 6h at :30 | Re-runs HogQL queries for custom signals, pushes to PostHog/Attio |
| Threshold Notifications | Every 6h | Sends billing threshold emails (90%, 95%, 100% MTU) |
| MTU Tracking | Daily 2 AM | Calculates MTU, reports to Stripe, manages billing cycles |

### Key issues

1. **Heuristic detectors are dead weight** — The 21 built-in detectors are hardcoded pattern matchers that don't reflect what customers actually care about. Real signals should come from two sources:
   - **Customer-defined**: Manually created from PostHog events or event combinations
   - **Agent-discovered**: Detected via COQL queries by the agent, then promoted to signal definitions when statistically significant

2. **Detection and sync are decoupled** — Signal sync doesn't consume signal occurrences. It independently re-runs HogQL queries against PostHog. This means:
   - Work is duplicated (detection queries accounts, sync re-queries PostHog)
   - Results can diverge (different time windows, different data freshness)
   - No single "source of truth" pipeline

3. **No signal-level notifications** — When a signal fires, nobody is notified. The notification cron only handles billing threshold emails.

4. **Overly complex scheduling** — Four jobs, three schedules, with implicit ordering dependencies but no enforcement. The 6-hourly sync schedule is redundant if evaluation is daily.

5. **Signals don't reliably reach CRM** — Delivery to Attio is only configured for custom signals with `auto_update` sync targets. There's no general mechanism to say "deliver all signals of type X to Attio."

## Proposed Solution

### Remove heuristic detectors, unify into a single daily pipeline

Delete the 21 hardcoded heuristic detectors. Signals will come exclusively from:
- **Customer-defined signal definitions** (PostHog events/combinations, stored in `signal_definitions`)
- **Agent-discovered signals** (COQL queries → statistically significant patterns → promoted to `signal_definitions`)

Replace the fragmented cron jobs with **one daily pipeline**:

```
Daily Pipeline (6 AM UTC)
+---------------------------------------------------------+
|                                                         |
|  Step 1: EVALUATE                                       |
|  +- For each active signal_definition:                  |
|  |  +- Build HogQL query from event_name, condition,   |
|  |  |  time_window_days                                 |
|  |  +- Execute against PostHog                          |
|  |  +- Create signal occurrences for matching accounts  |
|  +- Store all new occurrences -> signals table           |
|                                                         |
|  Step 2: SCORE                                          |
|  +- Recalculate signal aggregate metrics                |
|  +- Update signal_aggregates (lift, conversion, etc.)   |
|                                                         |
|  Step 3: DELIVER                                        |
|  +- For each signal_delivery_config:                    |
|  |  +- Match new occurrences to delivery rules          |
|  |  +- Push to Attio CRM lists (accounts/people)        |
|  |  +- Push to PostHog cohorts                          |
|  +- Track delivery status per destination               |
|                                                         |
|  Step 4: NOTIFY                                         |
|  +- Daily signal digest email to workspace admins       |
|  +- Skip if no new signals                              |
|                                                         |
+---------------------------------------------------------+

Separate (unchanged):
  - MTU Tracking -- Daily 2 AM (billing concern, not signal concern)
  - Threshold Notifications -- Every 6h (billing concern, keeps existing behavior)
```

### Why daily is sufficient

- Signal definitions evaluate over time windows (7, 14, 30 days). Running more than daily doesn't improve signal quality.
- CRM delivery doesn't need real-time cadence. RevOps teams work on daily or weekly cycles.
- Notifications are most useful as daily digests, not as 6-hourly check-ins.

## Task Breakdown

### Phase 1: Remove heuristic detectors and simplify signal sources

#### Task 1: Delete heuristic detector system

Remove the entire `lib/heuristics/signals/` directory:
- 21 detector files in `detectors/`
- `processor.ts` (signal processing engine)
- `helpers.ts` (detector utilities)
- `types.ts` (detector types)
- The `/api/cron/signal-detection` cron endpoint
- Related tests

Keep `lib/heuristics/engine.ts` (scoring engine) — it still consumes signal occurrences for score calculation.

**Files to delete/modify**:
- `src/lib/heuristics/signals/` (entire directory)
- `src/app/api/cron/signal-detection/route.ts`
- Remove `signal-detection` schedule from `vercel.json`

#### Task 2: Create `signal_delivery_configs` table

Replace the tightly-coupled `signal_sync_configs` / `signal_sync_targets` model with a simpler delivery model.

```sql
CREATE TABLE signal_delivery_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- What to deliver (matches signal_definitions.type or wildcard)
  signal_type VARCHAR(100) NOT NULL,

  -- Where to deliver
  destination_type VARCHAR(50) NOT NULL,  -- 'attio_list' | 'posthog_cohort'
  destination_config JSONB NOT NULL,      -- { list_id, object_type, field_mapping }

  -- Behavior
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(workspace_id, signal_type, destination_type)
);
```

Add RLS policies matching existing workspace-scoped pattern.

#### Task 3: Migrate existing sync targets

Write a migration that:
1. Creates `signal_delivery_configs`
2. Migrates existing `signal_sync_targets` (with their `signal_sync_configs`) into the new table
3. Keeps old tables temporarily (soft deprecation) for rollback safety

### Phase 2: Unified daily pipeline

#### Task 4: Build signal evaluation service

New file: `lib/signals/evaluation-service.ts`

Replaces the heuristic processor. For each workspace:
1. Load active `signal_definitions` where `event_name IS NOT NULL`
2. Build HogQL query from definition parameters (`event_name`, `condition_operator`, `condition_value`, `time_window_days`)
3. Execute query against PostHog with 60s timeout
4. Map matching `distinct_id`s to accounts
5. Create `signals` occurrences (deduplicate against existing within lookback window)

```typescript
interface EvaluationResult {
  workspace_id: string;
  definitions_evaluated: number;
  signals_created: number;
  errors: EvaluationError[];
}

async function evaluateSignalDefinitions(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<EvaluationResult>;
```

#### Task 5: Build delivery service

New file: `lib/signals/delivery-service.ts`

Consumes signal occurrences and delivers to configured destinations:

```typescript
interface DeliveryResult {
  workspace_id: string;
  signals_delivered: number;
  destinations_updated: number;
  errors: DeliveryError[];
}

async function deliverSignals(
  supabase: SupabaseClient,
  workspaceId: string,
  newSignals: Signal[]
): Promise<DeliveryResult>;
```

Logic:
1. Query `signal_delivery_configs` for the workspace
2. Group new signals by type
3. For each matching config:
   - `attio_list`: Upsert accounts/people into Attio list
   - `posthog_cohort`: Update cohort membership
4. Track delivery status per config

#### Task 6: Create unified pipeline orchestrator

New file: `lib/signals/daily-pipeline.ts`

```typescript
interface PipelineResult {
  evaluation: { definitions_evaluated: number; signals_created: number };
  scoring: { aggregates_updated: number };
  delivery: { signals_delivered: number; destinations_updated: number };
  notification: { digests_sent: number };
  duration_ms: number;
  errors: PipelineError[];
}

async function runDailyPipeline(supabase: SupabaseClient): Promise<PipelineResult>;
```

Steps:
1. **Evaluate**: Call `evaluateSignalDefinitions()` for each workspace
2. **Score**: Recalculate aggregate metrics via `metrics-calculator.ts`
3. **Deliver**: Call `deliverSignals()` for each workspace
4. **Notify**: Generate digests (Task 8)

Timeout strategy:
- Workspace-level batching with time budget check
- Checkpoint via `workspace_sync_log` with `sync_type = 'daily_pipeline'`
- Resumable on manual trigger if timeout

#### Task 7: New cron endpoint + vercel.json update

New route: `/api/cron/daily-pipeline`

- Replaces both `/api/cron/signal-detection` and `/api/cron/sync-signals`
- Calls `runDailyPipeline()`
- Max duration: 300s (Vercel Pro)

Update `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/daily-pipeline", "schedule": "0 6 * * *" },
    { "path": "/api/cron/mtu-tracking", "schedule": "0 2 * * *" },
    { "path": "/api/cron/threshold-notifications", "schedule": "0 */6 * * *" }
  ]
}
```

Update `/api/sync/trigger` to call unified pipeline.

### Phase 3: Notifications and cleanup

#### Task 8: Daily signal digest email

After delivery, generate a digest for each workspace with new signals:

- Reuse existing `notification-service.ts` Resend integration
- Group signals by type / account
- Skip if 0 new signals detected
- Add workspace-level preference: `signal_digest_enabled` (default: true)
- Respect unsubscribe

#### Task 9: Cleanup deprecated code

1. Delete `/api/cron/signal-detection` route
2. Delete `/api/cron/sync-signals` route
3. Delete `lib/heuristics/signals/` (if not already done in Task 1)
4. Remove sync-specific orchestration from `lib/integrations/attio/` and `lib/integrations/posthog/` (keep client methods)
5. Drop `signal_sync_configs` and `signal_sync_targets` tables in a future migration

#### Task 10: UI updates

- Signal detail page: Show delivery status (where was this signal delivered?)
- Settings: Configure delivery destinations per signal type (replace sync target UI)
- Dashboard: "Last pipeline run" status indicator with timestamp

## Updated Cron Schedule

### Before (4 jobs, 3 schedules)
```
signal-detection:        0 6 * * *        (daily 6 AM)
mtu-tracking:            0 2 * * *        (daily 2 AM)
threshold-notifications: 0 */6 * * *      (every 6h)
sync-signals:            30 */6 * * *     (every 6h at :30)
```

### After (3 jobs, 2 schedules)
```
daily-pipeline:          0 6 * * *        (daily 6 AM)
mtu-tracking:            0 2 * * *        (daily 2 AM)
threshold-notifications: 0 */6 * * *      (every 6h)
```

> Threshold notifications remain 6-hourly because they're billing-related (MTU enforcement). Time-sensitive for access blocking.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| 5-min Vercel timeout for larger pipelines | Workspace-level batching with checkpointing; resumable via manual trigger |
| Breaking existing sync target configs | Migration preserves existing configs; old tables kept temporarily |
| Attio rate limits during batch delivery | `Promise.allSettled()` with concurrency limit; respect Attio's 150 req/min |
| HogQL queries timing out | 60s timeout per query; skip and log on failure |
| Email digest fatigue | Default on, workspace-level opt-out; skip if 0 new signals |
| Removing heuristic detectors loses built-in signals | Intentional: signals should be customer-defined or agent-discovered, not hardcoded |

## Success Criteria

1. **Heuristic detector system fully removed** — no hardcoded signal patterns
2. **One cron job** handles evaluate -> score -> deliver -> notify (replaces two)
3. **All signal definitions can be delivered to Attio** — not just those with manually configured sync targets
4. **Workspace admins receive daily digest** with new signals
5. **Delivery status visible in UI** — "Signal X was delivered to Attio list Y at Z"

## Open Questions

1. **Attio company records or just people?** Current sync only pushes people (email-based). Signal definitions evaluate at the person level (distinct_id). Need to decide if we also support mapping to Attio company objects.
2. **Should the digest include scoring changes?** E.g., "Acme Corp conversion rate for Signal X improved to 12%" — useful but adds complexity.
3. **Self-hosted deployments** — Pipeline should work without PostHog/Attio for self-hosted users. Evaluate step returns 0 signals, delivery is no-op.
