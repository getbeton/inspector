/**
 * Signal definition evaluator.
 *
 * Given a `signal_definitions` row (manual or agent-emitted), build and execute
 * the corresponding HogQL query and return an aggregate MatchCountResult that
 * the existing `upsertSignalMetrics` helper can persist into `signal_aggregates`.
 *
 * Two paths:
 *   - Agent-emitted definitions carry a parameterized `query_template`; we
 *     substitute placeholders from `parameter_set` using a strict allowlist.
 *   - Manual definitions carry `event_name` + threshold columns; we delegate
 *     to the existing `calculateMatchCount` helper.
 */

import { PostHogClient } from '@/lib/integrations/posthog/client'
import { calculateMatchCount, type MatchCountResult } from './metrics-calculator'

export interface EvaluatableDefinition {
  type: string
  source: 'manual' | 'agent' | string | null
  event_name: string | null
  query_template: string | null
  parameter_set: Record<string, unknown> | null
}

/**
 * Substitute `{{key}}` placeholders in a HogQL template using only keys present
 * in `params`. Numbers are injected bare; strings are wrapped in single quotes
 * with embedded single quotes doubled.
 */
export function substituteTemplate(
  template: string,
  params: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    if (!(key in params)) {
      throw new Error(`Missing parameter '${key}' for query_template`)
    }
    const value = params[key]
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
    if (typeof value === 'boolean') return value ? '1' : '0'
    throw new Error(`Unsupported parameter type for '${key}'`)
  })
}

/**
 * Aggregate raw HogQL result rows into a MatchCountResult shape.
 *
 * The agent's canonical query shape returns one row per entity with columns:
 *   [distinct_id, recent_events, baseline_events_normalized, ...]
 *
 * Without further introspection we treat:
 *   - total_count = number of rows returned
 *   - count_7d = count of rows where the second numeric column (recent) > 0
 *   - count_30d = count of rows where any numeric column > 0 (fallback: total)
 */
export function aggregateQueryResult(rows: unknown[][] | undefined | null): MatchCountResult {
  if (!rows || rows.length === 0) {
    return { total_count: 0, count_7d: 0, count_30d: 0 }
  }

  let count7d = 0
  for (const row of rows) {
    const recent = typeof row?.[1] === 'number' ? row[1] : Number(row?.[1])
    if (Number.isFinite(recent) && recent > 0) count7d++
  }

  return {
    total_count: rows.length,
    count_7d: count7d,
    count_30d: rows.length,
  }
}

/**
 * Evaluate a definition and return its aggregate metrics. Throws if neither
 * `query_template` nor `event_name` is available.
 */
export async function evaluateDefinition(
  posthog: PostHogClient,
  definition: EvaluatableDefinition,
): Promise<MatchCountResult> {
  if (definition.query_template) {
    const params = (definition.parameter_set ?? {}) as Record<string, unknown>
    const hogql = substituteTemplate(definition.query_template, params)
    const result = await posthog.query(hogql, { timeoutMs: 60_000 })
    return aggregateQueryResult(result.results as unknown[][] | undefined)
  }

  if (definition.event_name) {
    return calculateMatchCount(posthog, definition.event_name)
  }

  throw new Error(
    `Definition '${definition.type}' has neither query_template nor event_name`,
  )
}
