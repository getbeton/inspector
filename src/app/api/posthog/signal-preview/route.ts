/**
 * POST /api/posthog/signal-preview
 *
 * Secure signal preview endpoint. Returns per-user event counts and
 * aggregate statistics without exposing any PostHog credentials.
 *
 * Profile URLs are constructed SERVER-SIDE — the frontend never sees
 * the project ID, API key, or region.
 *
 * Request:
 * {
 *   "event_names": ["pageview", "pricing_page_viewed"],
 *   "condition_operator": "gte",
 *   "condition_value": 2,
 *   "time_window_days": 7
 * }
 *
 * Response:
 * {
 *   "users": [{ "distinct_id": "...", "event_count": 47, "profile_url": "..." }],
 *   "total_matching_users": 342,
 *   "aggregate": { "total_count": 1500, "count_7d": 230, "count_30d": 890 }
 * }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { getPostHogConfig } from '@/lib/integrations/posthog/config'

// ============================================
// Input validation constants
// ============================================

/** Only allow safe event name characters (prevent HogQL injection) */
const EVENT_NAME_REGEX = /^[a-zA-Z0-9_.$\-/: ]+$/

const VALID_OPERATORS = new Set(['gte', 'gt', 'eq', 'lt', 'lte'])

const OPERATOR_SQL: Record<string, string> = {
  gte: '>=',
  gt: '>',
  eq: '=',
  lt: '<',
  lte: '<=',
}

const MAX_EVENT_NAMES = 10
const MAX_CONDITION_VALUE = 10000
const MAX_TIME_WINDOW_DAYS = 365
const MAX_PREVIEW_USERS = 50

// ============================================
// Request body type
// ============================================

interface SignalPreviewBody {
  event_names: string[]
  condition_operator: string
  condition_value: number
  time_window_days: number
}

// ============================================
// Validation
// ============================================

function validateBody(body: unknown): SignalPreviewBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be a JSON object')
  }

  const b = body as Record<string, unknown>

  // event_names
  if (!Array.isArray(b.event_names) || b.event_names.length === 0) {
    throw new Error('event_names must be a non-empty array')
  }
  if (b.event_names.length > MAX_EVENT_NAMES) {
    throw new Error(`event_names must have at most ${MAX_EVENT_NAMES} items`)
  }
  for (const name of b.event_names) {
    if (typeof name !== 'string' || !EVENT_NAME_REGEX.test(name)) {
      throw new Error(`Invalid event name: "${name}". Only alphanumeric, _, ., $, -, /, :, and spaces are allowed.`)
    }
  }

  // condition_operator
  const operator = String(b.condition_operator || 'gte')
  if (!VALID_OPERATORS.has(operator)) {
    throw new Error(`Invalid condition_operator: "${operator}". Must be one of: ${[...VALID_OPERATORS].join(', ')}`)
  }

  // condition_value
  const value = Number(b.condition_value ?? 1)
  if (!Number.isInteger(value) || value < 1 || value > MAX_CONDITION_VALUE) {
    throw new Error(`condition_value must be a positive integer up to ${MAX_CONDITION_VALUE}`)
  }

  // time_window_days
  const days = Number(b.time_window_days ?? 7)
  if (!Number.isInteger(days) || days < 1 || days > MAX_TIME_WINDOW_DAYS) {
    throw new Error(`time_window_days must be between 1 and ${MAX_TIME_WINDOW_DAYS}`)
  }

  return {
    event_names: b.event_names as string[],
    condition_operator: operator,
    condition_value: value,
    time_window_days: days,
  }
}

// ============================================
// Handler
// ============================================

async function handleSignalPreview(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { workspaceId } = context

  // Parse and validate
  let body: SignalPreviewBody
  try {
    const raw = await request.json()
    body = validateBody(raw)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request' },
      { status: 400 }
    )
  }

  // Get PostHog config (credentials stay server-side)
  const config = await getPostHogConfig(workspaceId)
  const client = new PostHogClient({
    apiKey: config.apiKey,
    projectId: config.projectId,
    host: config.host,
  })

  // Build safe HogQL — event names are pre-validated by regex
  const eventList = body.event_names.map(n => `'${n}'`).join(', ')
  const opSql = OPERATOR_SQL[body.condition_operator]

  // Per-user query: distinct_id + event_count, filtered by condition
  const userQuery = `
    SELECT
      distinct_id,
      count() as event_count
    FROM events
    WHERE event IN (${eventList})
      AND timestamp >= now() - interval ${body.time_window_days} day
    GROUP BY distinct_id
    HAVING count() ${opSql} ${body.condition_value}
    ORDER BY event_count DESC
    LIMIT ${MAX_PREVIEW_USERS}
  `

  // Aggregate query: total counts across time windows
  const aggregateQuery = `
    SELECT
      count() as total_count,
      countIf(timestamp >= now() - interval 7 day) as count_7d,
      countIf(timestamp >= now() - interval 30 day) as count_30d
    FROM events
    WHERE event IN (${eventList})
      AND timestamp >= now() - interval 90 day
  `

  // Count total matching users (without LIMIT)
  const countQuery = `
    SELECT count() as total
    FROM (
      SELECT distinct_id
      FROM events
      WHERE event IN (${eventList})
        AND timestamp >= now() - interval ${body.time_window_days} day
      GROUP BY distinct_id
      HAVING count() ${opSql} ${body.condition_value}
    )
  `

  const [userResult, aggregateResult, countResult] = await Promise.all([
    client.query(userQuery, { timeoutMs: 30_000 }),
    client.query(aggregateQuery, { timeoutMs: 30_000 }),
    client.query(countQuery, { timeoutMs: 30_000 }),
  ])

  // Build user list with server-side profile URLs
  const users = (userResult.results || []).map(row => ({
    distinct_id: String(row[0]),
    event_count: Number(row[1]) || 0,
    profile_url: `${config.appHost}/project/${config.projectId}/person/${encodeURIComponent(String(row[0]))}`,
  }))

  const aggRow = aggregateResult.results?.[0] || [0, 0, 0]
  const totalMatching = Number(countResult.results?.[0]?.[0]) || 0

  return NextResponse.json({
    users,
    total_matching_users: totalMatching,
    aggregate: {
      total_count: Number(aggRow[0]) || 0,
      count_7d: Number(aggRow[1]) || 0,
      count_30d: Number(aggRow[2]) || 0,
    },
  })
}

export const POST = withErrorHandler(withRLSContext(handleSignalPreview))
