/**
 * GET /api/posthog/events/definitions
 *
 * Fetch event definitions from PostHog for the current workspace.
 * Returns event names and 30-day volumes for use in the EventPicker component.
 *
 * Uses a DB cache (cached_posthog_events table) with a 15-minute TTL to
 * reduce PostHog API calls. Cache is per-workspace.
 *
 * Query params:
 *   ?include_system=true  - Include system events (names starting with $)
 *
 * Response:
 * {
 *   "results": [
 *     { "name": "pageview", "volume_30_day": 12345 },
 *     ...
 *   ],
 *   "cached": true
 * }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { getPostHogConfig } from '@/lib/integrations/posthog/config'

const CACHE_TTL_MINUTES = 15

/**
 * GET handler for event definitions with DB caching
 */
async function handleGetDefinitions(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase: _supabase, workspaceId } = context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = _supabase as any // New tables not yet in generated types
  const includeSystem = request.nextUrl.searchParams.get('include_system') === 'true'

  // 1. Check DB cache freshness
  const { data: cachedEvents } = await supabase
    .from('cached_posthog_events')
    .select('event_name, volume_30_day, is_system, cached_at')
    .eq('workspace_id', workspaceId)
    .limit(1)

  const isCacheFresh = cachedEvents && cachedEvents.length > 0 &&
    Date.now() - new Date(cachedEvents[0].cached_at).getTime() < CACHE_TTL_MINUTES * 60 * 1000

  let results: Array<{ name: string; volume_30_day: number }>

  if (isCacheFresh) {
    // 2a. Serve from cache
    const allCached = await supabase
      .from('cached_posthog_events')
      .select('event_name, volume_30_day, is_system')
      .eq('workspace_id', workspaceId)

    results = (allCached.data || []).map((row: { event_name: string; volume_30_day: number; is_system: boolean }) => ({
      name: row.event_name,
      volume_30_day: row.volume_30_day || 0,
    }))

    if (!includeSystem) {
      results = results.filter(e => !e.name.startsWith('$'))
    }

    results.sort((a, b) => (b.volume_30_day || 0) - (a.volume_30_day || 0))

    const response = NextResponse.json({ results, cached: true })
    response.headers.set('Cache-Control', 'private, max-age=300')
    return response
  }

  // 2b. Fetch fresh from PostHog
  const posthogConfig = await getPostHogConfig(workspaceId)
  const posthogClient = new PostHogClient({
    apiKey: posthogConfig.apiKey,
    projectId: posthogConfig.projectId,
    host: posthogConfig.host,
  })

  const data = await posthogClient.getEventDefinitions()

  // 3. Update DB cache (upsert all events, non-blocking)
  const now = new Date().toISOString()
  const upsertRows = data.results.map(e => ({
    workspace_id: workspaceId,
    event_name: e.name,
    volume_30_day: e.volume_30_day || 0,
    is_system: e.name.startsWith('$'),
    cached_at: now,
  }))

  if (upsertRows.length > 0) {
    supabase
      .from('cached_posthog_events')
      .upsert(upsertRows as never[], {
        onConflict: 'workspace_id,event_name',
      })
      .then(({ error }: { error: unknown }) => {
        if (error) console.error('Failed to cache event definitions:', error)
      })
  }

  // 4. Filter and return
  results = includeSystem
    ? data.results
    : data.results.filter(e => !e.name.startsWith('$'))

  results.sort((a, b) => (b.volume_30_day || 0) - (a.volume_30_day || 0))

  const response = NextResponse.json({ results, cached: false })
  response.headers.set('Cache-Control', 'private, max-age=300')
  return response
}

export const GET = withErrorHandler(withRLSContext(handleGetDefinitions))
