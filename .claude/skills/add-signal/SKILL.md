---
name: add-signal
description: Add a new signal type to the heuristics engine. Use when creating a new product usage signal detector for expansion, churn, or engagement patterns.
---

# /add-signal - Add New Signal Type

Use this skill to add a new signal type to Beton's heuristics engine. Signals detect product usage patterns that indicate expansion, churn risk, or sales opportunities.

## Workflow

### Step 1: Define the signal detector

Create `frontend-nextjs/src/lib/heuristics/signals/detectors/<signal-name>.ts`:

```typescript
/**
 * <Signal Name> Detector
 * Detects <description of what this signal identifies>
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, createDetectedSignal, daysAgo } from '../helpers'

export const <signalName>Detector: SignalDetectorDefinition = {
  meta: {
    name: '<signal_name_snake_case>',
    category: '<expansion|churn|engagement|billing>',
    description: '<Human-readable description>',
    defaultConfig: {
      threshold: <default_value>,
      lookback_days: 1,
      // Add other config options
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const threshold = config?.threshold ?? <default_threshold>
    const lookbackDays = config?.lookback_days ?? 1

    // Check for existing signal (prevent duplicates)
    if (await signalExists(supabase, accountId, '<signal_name>', lookbackDays)) {
      return null
    }

    // Your detection logic here
    // Example: Query account data, metrics, or events

    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .single()

    if (!account) {
      return null
    }

    // Calculate the metric or condition
    const metricValue = <calculate_metric>

    // Check if threshold is met
    if (metricValue >= threshold) {
      return createDetectedSignal(
        accountId,
        workspaceId,
        '<signal_name>',
        metricValue,
        {
          threshold,
          actual_value: metricValue,
          // Add relevant context for the signal
        }
      )
    }

    return null
  },
}
```

### Step 2: Export the detector

Add to `frontend-nextjs/src/lib/heuristics/signals/detectors/index.ts`:

```typescript
export { <signalName>Detector } from './<signal-name>'
```

### Step 3: Register in the processor

The detector will be automatically included via the detectors index.

Verify in `frontend-nextjs/src/lib/heuristics/signals/processor.ts` that detectors are loaded from the index.

### Step 4: Add configuration (optional)

If the signal needs workspace-specific configuration, add to the scoring config in `frontend-nextjs/src/lib/heuristics/scoring-config.ts`:

```typescript
export const SIGNAL_DEFAULTS = {
  // ... existing signals ...
  <signal_name>: {
    threshold: <value>,
    weight: <scoring_weight>,
  },
}
```

### Step 5: Update scoring weights (if affects scores)

If the signal impacts health/expansion/churn scores, update `frontend-nextjs/src/lib/heuristics/engine.ts`:

```typescript
const SIGNAL_WEIGHTS: Record<string, SignalWeight> = {
  // ... existing weights ...
  '<signal_name>': {
    health_impact: <-10 to +10>,      // Negative = bad for health
    expansion_impact: <-10 to +10>,   // Positive = expansion opportunity
    churn_impact: <-10 to +10>,       // Positive = churn risk
  },
}
```

### Step 6: Test the detector

Create tests or manually verify:

```typescript
// Manual test in API route or script
import { <signalName>Detector } from '@/lib/heuristics/signals/detectors/<signal-name>'

const result = await <signalName>Detector.detect(accountId, {
  supabase,
  workspaceId,
  config: { threshold: 0.5 }
})

console.log(result)
```

---

## Existing Signal Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| `expansion` | Upsell/upgrade opportunities | Usage spike, nearing paywall, seat limit |
| `churn` | Churn risk indicators | Usage drop, inactivity, low NPS |
| `engagement` | User engagement patterns | Director signup, invites sent |
| `billing` | Revenue-related signals | ARR decrease, upcoming renewal |

---

## Existing Detectors (Reference)

Located in `frontend-nextjs/src/lib/heuristics/signals/detectors/`:

- `usage-spike.ts` - Detects significant usage increases (>20%)
- `usage-drop.ts` - Detects usage declines
- `usage-wow-decline.ts` - Week-over-week usage decline
- `nearing-paywall.ts` - Approaching plan limits
- `approaching-seat-limit.ts` - Nearing seat capacity
- `director-signup.ts` - Decision-maker signed up
- `invites-sent.ts` - Team expansion activity
- `high-nps.ts` / `low-nps.ts` - NPS-based signals
- `inactivity.ts` - No recent activity
- `trial-ending.ts` - Trial expiration approaching
- `upcoming-renewal.ts` - Contract renewal due
- `arr-decrease.ts` - Revenue decline
- `future-cancellation.ts` - Scheduled cancellation
- `health-score-decrease.ts` - Health score dropped
- `incomplete-onboarding.ts` - Onboarding not finished
- `overage.ts` - Usage exceeded plan limits
- `free-decision-maker.ts` - Decision-maker on free plan
- `new-department-user.ts` - User from new department
- `upgrade-page-visit.ts` - Visited upgrade/pricing page

---

## Helper Functions

Use the helpers from `frontend-nextjs/src/lib/heuristics/signals/helpers.ts`:

```typescript
// Check if signal already exists (prevent duplicates)
await signalExists(supabase, accountId, 'signal_name', lookbackDays)

// Create a signal object
createDetectedSignal(accountId, workspaceId, 'signal_name', value, metadata)

// Calculate percentage change
calculatePercentageChange(oldValue, newValue)

// Get date N days ago
daysAgo(days)

// Count signals for an account
await countSignals(supabase, accountId, { startDate, endDate })
```

---

## Checklist

- [ ] Created detector in `lib/heuristics/signals/detectors/<name>.ts`
- [ ] Exported from `lib/heuristics/signals/detectors/index.ts`
- [ ] Defined `meta` with name, category, description, defaultConfig
- [ ] Implemented `detect()` function with proper return type
- [ ] Added duplicate prevention with `signalExists()`
- [ ] Updated scoring weights in `engine.ts` (if needed)
- [ ] Tested locally with `npm run dev`
- [ ] Ran `npm run build` before committing
