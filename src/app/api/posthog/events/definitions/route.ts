/**
 * GET /api/posthog/events/definitions
 *
 * Fetch event definitions from PostHog for the current workspace.
 * Returns event names and 30-day volumes for use in the EventPicker component.
 *
 * Query params:
 *   ?include_system=true  - Include system events (names starting with $)
 *
 * Response:
 * {
 *   "results": [
 *     { "name": "pageview", "volume_30_day": 12345 },
 *     ...
 *   ]
 * }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { getPostHogHost } from '@/lib/integrations/posthog/regions'
import { ConfigurationError } from '@/lib/errors/query-errors'

/**
 * Get PostHog configuration for the workspace
 */
async function getPostHogConfig(
  workspaceId: string
): Promise<{ apiKey: string; projectId: string; host?: string }> {
  const credentials = await getIntegrationCredentials(workspaceId, 'posthog')

  if (!credentials) {
    throw new ConfigurationError(
      'PostHog integration is not configured for this workspace. ' +
      'Please configure PostHog in Settings \u2192 Integrations.'
    )
  }

  if (!credentials.isActive) {
    throw new ConfigurationError(
      'PostHog integration is disabled for this workspace. ' +
      'Please enable it in Settings \u2192 Integrations.'
    )
  }

  if (credentials.status !== 'connected' && credentials.status !== 'validating') {
    throw new ConfigurationError(
      `PostHog integration status is "${credentials.status}". ` +
      'Please reconnect PostHog in Settings \u2192 Integrations.'
    )
  }

  if (!credentials.apiKey) {
    throw new ConfigurationError('PostHog API key is missing. Please reconfigure PostHog.')
  }

  if (!credentials.projectId) {
    throw new ConfigurationError('PostHog project ID is missing. Please reconfigure PostHog with a project ID.')
  }

  return {
    apiKey: credentials.apiKey,
    projectId: credentials.projectId,
    host: getPostHogHost(credentials.region),
  }
}

/**
 * GET handler for event definitions
 */
async function handleGetDefinitions(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { workspaceId } = context
  const includeSystem = request.nextUrl.searchParams.get('include_system') === 'true'

  const posthogConfig = await getPostHogConfig(workspaceId)

  const posthogClient = new PostHogClient({
    apiKey: posthogConfig.apiKey,
    projectId: posthogConfig.projectId,
    host: posthogConfig.host,
  })

  const data = await posthogClient.getEventDefinitions()

  // Filter out system events ($ prefix) unless explicitly requested
  const results = includeSystem
    ? data.results
    : data.results.filter(e => !e.name.startsWith('$'))

  // Sort by volume descending for better UX
  results.sort((a, b) => (b.volume_30_day || 0) - (a.volume_30_day || 0))

  const response = NextResponse.json({ results })
  response.headers.set('Cache-Control', 'private, max-age=300')
  return response
}

export const GET = withErrorHandler(withRLSContext(handleGetDefinitions))
