/**
 * GET /api/integrations/hubspot/search
 *
 * Proxies search requests to the HubSpot Search API.
 *
 * Query params:
 *   - connection_id: HubSpot connection UUID (required)
 *   - object_type: CRM object type to search (default: 'contacts')
 *   - q: Search query string (required)
 *   - limit: Max results (default: 10, max: 100)
 *   - after: Pagination cursor
 *
 * Heuristic: if query contains "@", searches by email; otherwise by name/domain.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { getHubSpotConnectionCredentials } from '@/lib/integrations/hubspot/config'
import { HubSpotClient } from '@/lib/integrations/hubspot/client'
import { createModuleLogger } from '@/lib/utils/logger'
import type { HubSpotSearchOptions, HubSpotObjectType } from '@/lib/integrations/hubspot/types'

const log = createModuleLogger('[HubSpot Search]')

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const url = new URL(request.url)
    const connectionId = url.searchParams.get('connection_id')
    const objectType = (url.searchParams.get('object_type') || 'contacts') as HubSpotObjectType
    const query = url.searchParams.get('q')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 100)
    const after = url.searchParams.get('after') || undefined

    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 })
    }

    if (!query) {
      return NextResponse.json({ error: 'q (search query) is required' }, { status: 400 })
    }

    // Verify connection belongs to this workspace
    const { data: connection } = await supabase
      .from('hubspot_connections' as never)
      .select('id, workspace_id')
      .eq('id', connectionId)
      .eq('workspace_id', membership.workspaceId)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Get credentials
    const credentials = await getHubSpotConnectionCredentials(connectionId)
    if (!credentials) {
      return NextResponse.json({ error: 'Failed to load connection credentials' }, { status: 500 })
    }

    // Create client
    const client = new HubSpotClient({
      token: credentials.token,
      authType: credentials.authType,
      connectionId,
    })

    // Build search options with heuristic
    const searchOptions = buildSearchOptions(query, objectType, limit, after)

    // Execute search
    const results = await client.search(objectType, searchOptions)

    return NextResponse.json({
      total: results.total,
      results: results.results,
      paging: results.paging,
    })
  } catch (error) {
    log.error('Search error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}

/**
 * Build search options with heuristic query detection.
 *
 * If query contains "@", it's likely an email — search by email property.
 * Otherwise, use HubSpot's full-text search (searches name, domain, etc.).
 */
function buildSearchOptions(
  query: string,
  objectType: HubSpotObjectType,
  limit: number,
  after?: string
): HubSpotSearchOptions {
  const isEmailQuery = query.includes('@')

  if (isEmailQuery) {
    // Search by email for contacts, or domain for companies
    const emailProperty = objectType === 'companies' ? 'domain' : 'email'

    return {
      filterGroups: [
        {
          filters: [
            {
              propertyName: emailProperty,
              operator: 'CONTAINS_TOKEN',
              value: query,
            },
          ],
        },
      ],
      limit,
      after,
    }
  }

  // Full-text search (HubSpot searches across name, email, domain, etc.)
  return {
    query,
    limit,
    after,
  }
}
