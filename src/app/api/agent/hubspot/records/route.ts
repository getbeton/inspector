/**
 * GET  /api/agent/hubspot/records — get a single record
 * POST /api/agent/hubspot/records — create or upsert a single record
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin, getHubSpotConnectionCredentialsAdmin } from '@/lib/integrations/hubspot/config'
import { createHubSpotClient } from '@/lib/integrations/hubspot/client'

const log = createModuleLogger('[API][Agent][HubSpot][Records]')

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

async function resolveWorkspaceAndConnection(
  sessionId: string,
  connectionId?: string
) {
  const session = await resolveSession(sessionId)
  const connection = await resolveHubSpotConnectionAdmin(session.workspaceId, connectionId)
  if (!connection) {
    throw new Error('NO_CONNECTION')
  }
  const credentials = await getHubSpotConnectionCredentialsAdmin(connection.id)
  if (!credentials) {
    throw new Error('CREDENTIALS_FAILED')
  }
  const client = createHubSpotClient({
    token: credentials.token,
    authType: credentials.authType,
    connectionId: credentials.connectionId,
    refreshToken: credentials.refreshToken || undefined,
    tokenExpiresAt: credentials.tokenExpiresAt,
  })
  return { workspaceId: session.workspaceId, connection, client }
}

/**
 * GET — Retrieve a single CRM record by ID.
 * Query params: session_id, object_type, record_id, connection_id?
 */
export async function GET(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('session_id')
    const objectType = searchParams.get('object_type')
    const recordId = searchParams.get('record_id')
    const connectionId = searchParams.get('connection_id') || undefined

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }
    if (!objectType) {
      return NextResponse.json({ error: 'Missing object_type' }, { status: 400 })
    }
    if (!recordId) {
      return NextResponse.json({ error: 'Missing record_id' }, { status: 400 })
    }

    let workspaceId: string
    let client: Awaited<ReturnType<typeof resolveWorkspaceAndConnection>>['client']
    try {
      const resolved = await resolveWorkspaceAndConnection(sessionId, connectionId)
      workspaceId = resolved.workspaceId
      client = resolved.client
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      if (msg === 'NO_CONNECTION') {
        return NextResponse.json({ error: 'No active HubSpot connection found' }, { status: 404 })
      }
      if (msg === 'CREDENTIALS_FAILED') {
        return NextResponse.json({ error: 'Failed to retrieve HubSpot credentials' }, { status: 500 })
      }
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    const record = await client.getRecord(objectType, recordId)
    log.info(`Get record ${objectType}/${recordId} for workspace=${workspaceId}`)
    return NextResponse.json(stripNulls(record))
  } catch (e) {
    log.error(`Get record failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST — Create or upsert a single CRM record.
 * Body: { session_id, object_type, properties, matching_property?, connection_id? }
 */
export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { session_id, object_type, properties, matching_property, connection_id } = body

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }
    if (!object_type) {
      return NextResponse.json({ error: 'Missing object_type' }, { status: 400 })
    }
    if (!properties || typeof properties !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid properties' }, { status: 400 })
    }

    let workspaceId: string
    let client: Awaited<ReturnType<typeof resolveWorkspaceAndConnection>>['client']
    try {
      const resolved = await resolveWorkspaceAndConnection(session_id, connection_id)
      workspaceId = resolved.workspaceId
      client = resolved.client
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      if (msg === 'NO_CONNECTION') {
        return NextResponse.json({ error: 'No active HubSpot connection found' }, { status: 404 })
      }
      if (msg === 'CREDENTIALS_FAILED') {
        return NextResponse.json({ error: 'Failed to retrieve HubSpot credentials' }, { status: 500 })
      }
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    let result
    if (matching_property) {
      // Upsert: search by matching property, then create or update
      const matchValue = properties[matching_property]
      if (!matchValue) {
        return NextResponse.json(
          { error: `Missing matching property "${matching_property}" in properties` },
          { status: 400 }
        )
      }

      const searchResult = await client.search(object_type, {
        filterGroups: [{
          filters: [{
            propertyName: matching_property,
            operator: 'EQ',
            value: String(matchValue),
          }],
        }],
        limit: 1,
      })

      if (searchResult.results.length > 0) {
        const existingId = searchResult.results[0].id
        result = await client.updateRecord(object_type, existingId, properties)
        log.info(`Updated ${object_type}/${existingId} for workspace=${workspaceId}`)
        return NextResponse.json(stripNulls({ ...result, action: 'updated' }))
      }
    }

    // Create new record
    result = await client.createRecord(object_type, properties)
    log.info(`Created ${object_type}/${result.id} for workspace=${workspaceId}`)
    return NextResponse.json(stripNulls({ ...result, action: 'created' }), { status: 201 })
  } catch (e) {
    log.error(`Create/upsert record failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
