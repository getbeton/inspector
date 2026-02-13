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
import { getPostHogConfig } from '@/lib/integrations/posthog/config'
import { InvalidQueryError } from '@/lib/errors/query-errors'
import type { QueryExecutionRequest, QueryExecutionResult } from '@/lib/types/posthog-query'

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

  // Get PostHog configuration for workspace (credentials are decrypted automatically)
  const posthogConfig = await getPostHogConfig(workspaceId)

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
