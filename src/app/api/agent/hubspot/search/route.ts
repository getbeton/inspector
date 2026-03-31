/**
 * POST /api/agent/hubspot/search
 *
 * Agent endpoint to search HubSpot CRM objects.
 * Uses HubSpot Search API with filters, properties, and pagination.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin, getHubSpotConnectionCredentialsAdmin } from '@/lib/integrations/hubspot/config'
import { createHubSpotClient } from '@/lib/integrations/hubspot/client'
import { STANDARD_OBJECT_TYPES } from '@/lib/integrations/hubspot/types'

const log = createModuleLogger('[API][Agent][HubSpot][Search]')

/** Known CRM object types (standard + common engagement types) */
const VALID_OBJECT_TYPES = new Set([
  ...STANDARD_OBJECT_TYPES,
  'line_items',
  'products',
  'quotes',
  'calls',
  'emails',
  'meetings',
  'notes',
  'tasks',
])

/**
 * Recursively strip null/undefined values from an object to minimize token consumption.
 */
function stripNulls<T>(obj: T): T {
  if (obj === null || obj === undefined) return undefined as unknown as T
  if (Array.isArray(obj)) return obj.map(stripNulls) as unknown as T
  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v !== null && v !== undefined) {
        cleaned[k] = stripNulls(v)
      }
    }
    return cleaned as T
  }
  return obj
}

export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { session_id, object_type, filters, properties, limit, after, connection_id } = body

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    if (!object_type) {
      return NextResponse.json({ error: 'Missing object_type' }, { status: 400 })
    }

    if (!VALID_OBJECT_TYPES.has(object_type)) {
      return NextResponse.json(
        { error: `Invalid object_type "${object_type}". Valid types: ${Array.from(VALID_OBJECT_TYPES).join(', ')}` },
        { status: 400 }
      )
    }

    // Resolve session -> workspace
    let workspaceId: string
    try {
      const session = await resolveSession(session_id)
      workspaceId = session.workspaceId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    // Rate limit per workspace
    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    // Resolve HubSpot connection
    const connection = await resolveHubSpotConnectionAdmin(workspaceId, connection_id)
    if (!connection) {
      return NextResponse.json(
        { error: 'No active HubSpot connection found for this workspace' },
        { status: 404 }
      )
    }

    // Get credentials
    const credentials = await getHubSpotConnectionCredentialsAdmin(connection.id)
    if (!credentials) {
      return NextResponse.json(
        { error: 'Failed to retrieve HubSpot credentials' },
        { status: 500 }
      )
    }

    // Create client
    const client = createHubSpotClient({
      token: credentials.token,
      authType: credentials.authType,
      connectionId: credentials.connectionId,
      refreshToken: credentials.refreshToken || undefined,
      tokenExpiresAt: credentials.tokenExpiresAt,
    })

    // Execute search
    const searchResult = await client.search(object_type, {
      filterGroups: filters || [],
      properties: properties || [],
      limit: Math.min(limit || 10, 100),
      after: after || '0',
    })

    log.info(
      `Search ${object_type}: ${searchResult.total} results for workspace=${workspaceId}`
    )

    return NextResponse.json(stripNulls(searchResult))
  } catch (e) {
    log.error(`HubSpot search failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
