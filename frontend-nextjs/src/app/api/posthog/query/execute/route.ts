/**
 * POST /api/posthog/query/execute
 *
 * Execute a HogQL query against PostHog with caching and rate limiting
 *
 * Request:
 * {
 *   "query": "SELECT event, count() FROM events GROUP BY event"
 * }
 *
 * Response (success):
 * {
 *   "query_id": "uuid",
 *   "status": "completed",
 *   "execution_time_ms": 1234,
 *   "row_count": 10,
 *   "columns": ["event", "count"],
 *   "results": [["$pageview", 1000]],
 *   "cached": false
 * }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { QueryService } from '@/lib/services/query-service'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { ConfigurationError, InvalidQueryError } from '@/lib/errors/query-errors'
import type { IntegrationConfig, Json } from '@/lib/supabase/types'
import type { QueryExecutionRequest, QueryExecutionResult } from '@/lib/types/posthog-query'

/** PostHog config from integration_configs.config_json */
interface PostHogConfigJson {
  project_id?: string
  host?: string
}

/**
 * Get PostHog configuration for the workspace
 */
async function getPostHogConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string
): Promise<{ apiKey: string; projectId: string; host?: string }> {
  const { data, error } = await supabase
    .from('integration_configs')
    .select('api_key_encrypted, config_json, is_active, status')
    .eq('workspace_id', workspaceId)
    .eq('integration_name', 'posthog')
    .single()

  const config = data as IntegrationConfig | null

  if (error || !config) {
    throw new ConfigurationError(
      'PostHog integration is not configured for this workspace. ' +
      'Please configure PostHog in Settings → Integrations.'
    )
  }

  if (!config.is_active) {
    throw new ConfigurationError(
      'PostHog integration is disabled for this workspace. ' +
      'Please enable it in Settings → Integrations.'
    )
  }

  if (config.status !== 'connected' && config.status !== 'validating') {
    throw new ConfigurationError(
      `PostHog integration status is "${config.status}". ` +
      'Please reconnect PostHog in Settings → Integrations.'
    )
  }

  if (!config.api_key_encrypted) {
    throw new ConfigurationError(
      'PostHog API key is missing. Please reconfigure PostHog.'
    )
  }

  const configJson = config.config_json as PostHogConfigJson | null

  if (!configJson?.project_id) {
    throw new ConfigurationError(
      'PostHog project ID is missing. Please reconfigure PostHog with a project ID.'
    )
  }

  return {
    apiKey: config.api_key_encrypted,
    projectId: configJson.project_id,
    host: configJson.host,
  }
}

/**
 * POST handler for query execution
 */
async function handleExecute(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context

  // Parse and validate request body
  let body: QueryExecutionRequest
  try {
    body = await request.json()
  } catch {
    throw new InvalidQueryError('Invalid JSON in request body')
  }

  if (!body.query || typeof body.query !== 'string') {
    throw new InvalidQueryError('Missing or invalid "query" field in request body')
  }

  const queryText = body.query.trim()
  if (!queryText) {
    throw new InvalidQueryError('Query cannot be empty')
  }

  // Get PostHog configuration for workspace
  const posthogConfig = await getPostHogConfig(supabase, workspaceId)

  // Create PostHog client
  const posthogClient = new PostHogClient({
    apiKey: posthogConfig.apiKey,
    projectId: posthogConfig.projectId,
    host: posthogConfig.host,
  })

  // Create QueryService with dependencies
  const queryService = new QueryService({
    supabase,
    posthogClient,
  })

  // Execute query
  const result = await queryService.execute(workspaceId, queryText)

  // Format response
  const response: QueryExecutionResult & { rate_limit: { remaining: number; limit: number } } = {
    query_id: result.queryId,
    status: result.results.status,
    execution_time_ms: result.results.execution_time_ms,
    row_count: result.results.row_count,
    columns: result.results.columns,
    results: result.results.results,
    cached: result.cached,
    rate_limit: {
      remaining: result.rateLimitStatus.remaining,
      limit: result.rateLimitStatus.limit,
    },
  }

  return NextResponse.json(response)
}

/**
 * Export POST handler with middleware
 *
 * Middleware chain:
 * 1. withErrorHandler - Catches errors and returns consistent JSON
 * 2. withRLSContext - Sets workspace context for database queries
 * 3. handleExecute - Actual handler logic
 */
export const POST = withErrorHandler(withRLSContext(handleExecute))
