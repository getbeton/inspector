/**
 * POST /api/signals/custom
 *
 * Create a new manual signal and trigger initial metrics calculation.
 * Match count is calculated synchronously (fast).
 * Conversion and lift are calculated asynchronously (not blocking response).
 *
 * Request:
 * {
 *   "name": "Pricing page visited 2+ times",
 *   "description": "Users showing pricing interest",
 *   "event_name": "pageview",
 *   "condition_operator": "gte",
 *   "condition_value": 2,
 *   "time_window_days": 7,
 *   "conversion_event": "subscription_created" (optional)
 * }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { getPostHogHost } from '@/lib/integrations/posthog/regions'
import { ConfigurationError, InvalidQueryError } from '@/lib/errors/query-errors'
import { calculateMatchCount, upsertSignalMetrics } from '@/lib/signals/metrics-calculator'

async function getPostHogConfig(
  workspaceId: string
): Promise<{ apiKey: string; projectId: string; host?: string }> {
  const credentials = await getIntegrationCredentials(workspaceId, 'posthog')

  if (!credentials) {
    throw new ConfigurationError('PostHog integration is not configured.')
  }
  if (!credentials.isActive) {
    throw new ConfigurationError('PostHog integration is disabled.')
  }
  if (credentials.status !== 'connected' && credentials.status !== 'validating') {
    throw new ConfigurationError(`PostHog integration status is "${credentials.status}".`)
  }
  if (!credentials.apiKey || !credentials.projectId) {
    throw new ConfigurationError('PostHog credentials are incomplete.')
  }

  return {
    apiKey: credentials.apiKey,
    projectId: credentials.projectId,
    host: getPostHogHost(credentials.region),
  }
}

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
  const { supabase, workspaceId } = context

  let body: CreateCustomSignalBody
  try {
    body = await request.json()
  } catch {
    throw new InvalidQueryError('Invalid JSON in request body')
  }

  if (!body.name || !body.event_name) {
    throw new InvalidQueryError('name and event_name are required')
  }

  // Get PostHog config
  const posthogConfig = await getPostHogConfig(workspaceId)
  const posthogClient = new PostHogClient({
    apiKey: posthogConfig.apiKey,
    projectId: posthogConfig.projectId,
    host: posthogConfig.host,
  })

  // Calculate match count synchronously (fast ~1-2s)
  const matchCount = await calculateMatchCount(posthogClient, body.event_name)

  // Create the signal in the database
  const signalType = `custom:${body.event_name}`
  const { data: signal, error } = await supabase
    .from('signals')
    .insert({
      workspace_id: workspaceId,
      // Use a placeholder account_id — custom signals are workspace-level
      account_id: workspaceId,
      type: signalType,
      source: 'manual',
      value: matchCount.count_30d,
      details: {
        name: body.name,
        description: body.description || '',
        event_name: body.event_name,
        condition_operator: body.condition_operator || 'gte',
        condition_value: body.condition_value || 1,
        time_window_days: body.time_window_days || 7,
        conversion_event: body.conversion_event || null,
        match_count: matchCount,
      },
    } as never)
    .select()
    .single()

  if (error) {
    console.error('Failed to create custom signal:', error)
    return NextResponse.json({ error: 'Failed to create signal' }, { status: 500 })
  }

  // Store initial match count metrics
  await upsertSignalMetrics(supabase, workspaceId, signalType, matchCount).catch(err => {
    console.error('Failed to store initial metrics (non-blocking):', err)
  })

  return NextResponse.json({
    signal,
    metrics: {
      status: body.conversion_event ? 'calculating' : 'ready',
      match_count: matchCount,
    },
  }, { status: 201 })
}

export const POST = withErrorHandler(withRLSContext(handleCreateCustomSignal))
