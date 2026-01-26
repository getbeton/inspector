/**
 * POST /api/billing/calculate-mtu
 *
 * Calculate Monthly Tracked Users (MTU) count from PostHog
 *
 * Can be used in two modes:
 * 1. Setup mode: Pass credentials directly in request body (for validation flow)
 * 2. Normal mode: No credentials needed, uses stored workspace credentials
 *
 * Request (setup mode):
 * {
 *   "api_key": "phx_...",
 *   "project_id": "12345",
 *   "region": "us" | "eu"
 * }
 *
 * Request (normal mode):
 * {} (empty body, uses stored credentials)
 *
 * Response:
 * {
 *   "mtu_count": 1234,
 *   "source": "posthog",
 *   "billing_cycle_start": "2026-01-01",
 *   "billing_cycle_end": "2026-01-31"
 * }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { calculateMTU, storeMTUTracking } from '@/lib/billing/mtu-service'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { getPostHogHost } from '@/lib/integrations/posthog/regions'

/**
 * Validates and sanitizes a date string for safe use in HogQL queries.
 * Only allows YYYY-MM-DD format to prevent SQL injection.
 *
 * @param date - Date object to convert
 * @returns Sanitized date string in YYYY-MM-DD format
 * @throws Error if date is invalid
 */
function sanitizeDateForHogQL(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided for HogQL query');
  }

  const isoString = date.toISOString().split('T')[0];

  // Strict validation: only allow YYYY-MM-DD format
  // This regex ensures no special characters can be injected
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(isoString)) {
    throw new Error(`Invalid date format: ${isoString}. Expected YYYY-MM-DD.`);
  }

  return isoString;
}

/**
 * Calculate MTU directly from PostHog using provided credentials
 * Used during setup before credentials are stored
 */
async function calculateMTUDirect(
  apiKey: string,
  projectId: string,
  region?: string
): Promise<{ mtuCount: number; source: string }> {
  // Always derive host from region to ensure /api path is included
  const host = getPostHogHost(region)

  const client = new PostHogClient({
    apiKey,
    projectId,
    host,
  })

  // Get billing cycle dates (current month)
  const now = new Date()
  const billingCycleStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const billingCycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  // Sanitize dates to prevent SQL injection (defense in depth)
  const startDateStr = sanitizeDateForHogQL(billingCycleStart);
  const endDateStr = sanitizeDateForHogQL(billingCycleEnd);

  // Query for distinct identified users (those with email) in this billing period
  // This filters out anonymous visitors who haven't been identified via posthog.identify()
  const hogqlQuery = `
    SELECT count(DISTINCT person_id) as mtu_count
    FROM events
    WHERE timestamp >= toDateTime('${startDateStr}')
      AND timestamp <= toDateTime('${endDateStr} 23:59:59')
      AND person_id IN (
        SELECT id FROM persons
        WHERE properties['email'] IS NOT NULL
          AND properties['email'] != ''
      )
  `

  try {
    const result = await client.query(hogqlQuery, { timeoutMs: 60000 })

    if (result.results && result.results[0] && result.results[0][0] !== undefined) {
      const count = Number(result.results[0][0])
      return {
        mtuCount: isNaN(count) ? 0 : count,
        source: 'posthog_hogql',
      }
    }

    // HogQL returned empty results - try counting via API
    // This is slower but more accurate than returning a hardcoded estimate
    console.warn('[calculate-mtu] HogQL returned empty results, falling back to API count')
    return await countPersonsViaAPI(client)
  } catch (error) {
    console.warn('[calculate-mtu] HogQL query failed, trying persons count:', error)

    // Try persons endpoint as fallback
    try {
      return await countPersonsViaAPI(client)
    } catch (apiError) {
      console.error('[calculate-mtu] API fallback also failed:', apiError)
      throw new Error('Failed to calculate MTU from PostHog. Please try again later.')
    }
  }
}

/**
 * Count persons with email via paginated API calls.
 * More accurate than hardcoded estimates but slower.
 * Includes a safety limit to prevent Vercel timeout.
 */
async function countPersonsViaAPI(
  client: PostHogClient
): Promise<{ mtuCount: number; source: string }> {
  const MAX_PAGES = 100 // Safety limit: 100 pages * 100 per page = 10,000 max
  const PER_PAGE = 100
  let totalCount = 0
  let pageCount = 0
  let cursor: string | undefined

  try {
    do {
      const response = await client.getPersons({ limit: PER_PAGE, cursor })

      // Count only identified users (those with email property)
      const identifiedPersons = response.results.filter(
        (person: { properties?: { email?: string } }) =>
          person.properties?.email && person.properties.email.trim() !== ''
      )
      totalCount += identifiedPersons.length
      pageCount++

      // Get next page cursor
      cursor = response.next

      // Safety: stop if we've hit the page limit to avoid timeout
      if (pageCount >= MAX_PAGES) {
        console.warn(
          `[calculate-mtu] Reached page limit (${MAX_PAGES}), counted ${totalCount} persons so far`
        )
        return {
          mtuCount: totalCount,
          source: 'posthog_api_partial', // Indicate partial count
        }
      }
    } while (cursor)

    return {
      mtuCount: totalCount,
      source: 'posthog_api_complete',
    }
  } catch (error) {
    // If we've counted some, return what we have
    if (totalCount > 0) {
      console.warn(
        `[calculate-mtu] API pagination failed after ${pageCount} pages, returning partial count: ${totalCount}`
      )
      return {
        mtuCount: totalCount,
        source: 'posthog_api_partial',
      }
    }
    throw error
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get workspace
    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { api_key, project_id, region } = body

    // Determine mode based on whether credentials are provided
    const hasDirectCredentials = api_key && project_id

    if (hasDirectCredentials) {
      // Setup mode: Calculate using provided credentials
      try {
        const result = await calculateMTUDirect(api_key, project_id, region)

        return NextResponse.json({
          mtu_count: result.mtuCount,
          mtuCount: result.mtuCount, // Also include camelCase for backward compat
          source: result.source,
          billing_cycle_start: new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1
          )
            .toISOString()
            .split('T')[0],
          billing_cycle_end: new Date(
            new Date().getFullYear(),
            new Date().getMonth() + 1,
            0
          )
            .toISOString()
            .split('T')[0],
        })
      } catch (error) {
        console.error('[calculate-mtu] Direct calculation failed:', error)
        return NextResponse.json(
          {
            error: 'Failed to calculate MTU',
            message:
              error instanceof Error ? error.message : 'Unknown error occurred',
          },
          { status: 500 }
        )
      }
    } else {
      // Normal mode: Use stored workspace credentials
      const credentials = await getIntegrationCredentials(
        membership.workspaceId,
        'posthog'
      )

      if (!credentials || !credentials.apiKey || !credentials.projectId) {
        return NextResponse.json(
          {
            error: 'PostHog not configured',
            message:
              'PostHog credentials are not configured for this workspace.',
          },
          { status: 400 }
        )
      }

      // Use the existing MTU service
      const result = await calculateMTU(membership.workspaceId, {
        skipCache: true,
      })

      if (!result) {
        return NextResponse.json(
          {
            error: 'Failed to calculate MTU',
            message: 'Could not retrieve MTU data from PostHog.',
          },
          { status: 500 }
        )
      }

      // Store the result
      await storeMTUTracking(membership.workspaceId, result)

      return NextResponse.json({
        mtu_count: result.mtuCount,
        mtuCount: result.mtuCount,
        source: result.source,
        billing_cycle_start: result.billingCycleStart,
        billing_cycle_end: result.billingCycleEnd,
      })
    }
  } catch (error) {
    console.error('Error in POST /api/billing/calculate-mtu:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
