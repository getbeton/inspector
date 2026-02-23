/**
 * POST /api/signals/custom
 *
 * Create a new custom signal definition and trigger initial metrics calculation.
 * Now writes to `signal_definitions` table instead of `signals`.
 *
 * PATCH /api/signals/custom
 *
 * Add a sync target (PostHog cohort or Attio list) to an existing signal definition.
 *
 * Request (POST):
 * {
 *   "name": "Pricing page visited 2+ times",
 *   "description": "Users showing pricing interest",
 *   "event_name": "pageview",
 *   "condition_operator": "gte",
 *   "condition_value": 2,
 *   "time_window_days": 7,
 *   "conversion_event": "subscription_created" (optional)
 * }
 *
 * Request (PATCH):
 * {
 *   "signal_definition_id": "uuid",
 *   "event_names": ["pageview"],
 *   "condition_operator": "gte",
 *   "condition_value": 2,
 *   "time_window_days": 7,
 *   "target": {
 *     "type": "posthog_cohort" | "attio_list",
 *     "external_id": "42",
 *     "external_name": "Signal: Pricing Page Interest",
 *     "auto_update": true
 *   }
 * }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { getPostHogConfig } from '@/lib/integrations/posthog/config'
import { InvalidQueryError } from '@/lib/errors/query-errors'
import { calculateMatchCount, upsertSignalMetrics } from '@/lib/signals/metrics-calculator'

const VALID_OPERATORS = new Set(['gte', 'gt', 'eq', 'lt', 'lte'])
const VALID_TARGET_TYPES = new Set(['posthog_cohort', 'attio_list'])

interface CreateCustomSignalBody {
  name: string
  description?: string
  event_name: string
  condition_operator?: string
  condition_value?: number
  time_window_days?: number
  conversion_event?: string
}

async function handleCreateCustomSignal(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = context.supabase as any
  const { workspaceId } = context

  let body: CreateCustomSignalBody
  try {
    body = await request.json()
  } catch {
    throw new InvalidQueryError('Invalid JSON in request body')
  }

  if (!body.name || !body.event_name) {
    throw new InvalidQueryError('name and event_name are required')
  }

  // Validate event_name format to prevent injection
  if (!/^[\w.$\-/:]+$/.test(body.event_name)) {
    throw new InvalidQueryError('event_name contains invalid characters')
  }
  if (body.condition_value !== undefined && (typeof body.condition_value !== 'number' || body.condition_value < 0)) {
    throw new InvalidQueryError('condition_value must be a non-negative number')
  }
  if (body.time_window_days !== undefined && (typeof body.time_window_days !== 'number' || body.time_window_days < 1 || body.time_window_days > 365)) {
    throw new InvalidQueryError('time_window_days must be between 1 and 365')
  }

  // Get PostHog config
  const posthogConfig = await getPostHogConfig(workspaceId)
  const posthogClient = new PostHogClient({
    apiKey: posthogConfig.apiKey,
    projectId: posthogConfig.projectId,
    host: posthogConfig.host,
  })

  const signalType = `custom:${body.event_name}`
  const conditionOperator = body.condition_operator || 'gte'
  const conditionValue = body.condition_value || 1
  const timeWindowDays = body.time_window_days || 7

  // Create the signal definition
  const { data: definition, error } = await supabase
    .from('signal_definitions')
    .insert({
      workspace_id: workspaceId,
      name: body.name,
      description: body.description || '',
      type: signalType,
      event_name: body.event_name,
      condition_operator: conditionOperator,
      condition_value: conditionValue,
      time_window_days: timeWindowDays,
      conversion_event: body.conversion_event || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create signal definition:', error)
    return NextResponse.json({ error: 'Failed to create signal definition' }, { status: 500 })
  }

  // Fire-and-forget: calculate match count and upsert metrics in the background.
  calculateMatchCount(posthogClient, body.event_name)
    .then(async (matchCount) => {
      await upsertSignalMetrics(supabase, workspaceId, signalType, matchCount)
    })
    .catch((err) => {
      console.error('Background metrics calculation failed:', err)
    })

  return NextResponse.json({
    signal_definition: definition,
    metrics: {
      status: 'calculating',
      match_count: null,
    },
  }, { status: 202 })
}

/**
 * PATCH handler: add a sync target to an existing signal definition.
 * Creates the sync config if it doesn't exist, then adds the target.
 */
interface AddSyncTargetBody {
  signal_definition_id: string
  event_names: string[]
  condition_operator: string
  condition_value: number
  time_window_days: number
  target: {
    type: string
    external_id: string
    external_name?: string
    auto_update: boolean
  }
}

async function handleAddSyncTarget(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = context.supabase as any
  const { workspaceId } = context

  let body: AddSyncTargetBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate
  if (!body.signal_definition_id || !body.target?.type || !body.target?.external_id) {
    return NextResponse.json(
      { error: 'signal_definition_id, target.type, and target.external_id are required' },
      { status: 400 }
    )
  }
  if (!VALID_TARGET_TYPES.has(body.target.type)) {
    return NextResponse.json(
      { error: `Invalid target type. Must be one of: ${[...VALID_TARGET_TYPES].join(', ')}` },
      { status: 400 }
    )
  }
  if (!VALID_OPERATORS.has(body.condition_operator)) {
    return NextResponse.json(
      { error: `Invalid condition_operator. Must be one of: ${[...VALID_OPERATORS].join(', ')}` },
      { status: 400 }
    )
  }

  // Verify signal definition belongs to workspace
  const { data: definition } = await supabase
    .from('signal_definitions')
    .select('id')
    .eq('id', body.signal_definition_id)
    .eq('workspace_id', workspaceId)
    .single()

  if (!definition) {
    return NextResponse.json({ error: 'Signal definition not found' }, { status: 404 })
  }

  // Upsert sync config (create if not exists)
  const { data: existingConfig } = await supabase
    .from('signal_sync_configs')
    .select('id')
    .eq('signal_definition_id', body.signal_definition_id)
    .single()

  let syncConfigId: string

  if (existingConfig) {
    syncConfigId = existingConfig.id
    // Update query params if they changed
    await supabase
      .from('signal_sync_configs')
      .update({
        event_names: body.event_names,
        condition_operator: body.condition_operator,
        condition_value: body.condition_value,
        time_window_days: body.time_window_days,
      } as never)
      .eq('id', syncConfigId)
  } else {
    const { data: newConfig, error: configError } = await supabase
      .from('signal_sync_configs')
      .insert({
        signal_definition_id: body.signal_definition_id,
        workspace_id: workspaceId,
        event_names: body.event_names,
        condition_operator: body.condition_operator,
        condition_value: body.condition_value,
        time_window_days: body.time_window_days,
      } as never)
      .select('id')
      .single()

    if (configError || !newConfig) {
      console.error('Failed to create sync config:', configError)
      return NextResponse.json({ error: 'Failed to create sync config' }, { status: 500 })
    }
    syncConfigId = newConfig.id
  }

  // Add sync target
  const { data: target, error: targetError } = await supabase
    .from('signal_sync_targets')
    .insert({
      sync_config_id: syncConfigId,
      target_type: body.target.type,
      external_id: body.target.external_id,
      external_name: body.target.external_name || null,
      auto_update: body.target.auto_update,
    } as never)
    .select()
    .single()

  if (targetError) {
    console.error('Failed to create sync target:', targetError)
    return NextResponse.json({ error: 'Failed to create sync target' }, { status: 500 })
  }

  return NextResponse.json({ sync_target: target }, { status: 201 })
}

export const POST = withErrorHandler(withRLSContext(handleCreateCustomSignal))
export const PATCH = withErrorHandler(withRLSContext(handleAddSyncTarget))
