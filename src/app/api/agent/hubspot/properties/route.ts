/**
 * GET  /api/agent/hubspot/properties — list properties for an object type
 * POST /api/agent/hubspot/properties — create a custom property
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin, getHubSpotConnectionCredentialsAdmin } from '@/lib/integrations/hubspot/config'
import { createHubSpotClient } from '@/lib/integrations/hubspot/client'

const log = createModuleLogger('[API][Agent][HubSpot][Properties]')

/**
 * GET — List properties for an object type.
 * Query params: session_id, object_type, connection_id?
 */
export async function GET(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('session_id')
    const objectType = searchParams.get('object_type')
    const connectionId = searchParams.get('connection_id') || undefined

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }
    if (!objectType) {
      return NextResponse.json({ error: 'Missing object_type' }, { status: 400 })
    }

    let workspaceId: string
    try {
      const session = await resolveSession(sessionId)
      workspaceId = session.workspaceId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    const connection = await resolveHubSpotConnectionAdmin(workspaceId, connectionId)
    if (!connection) {
      return NextResponse.json({ error: 'No active HubSpot connection found' }, { status: 404 })
    }

    const credentials = await getHubSpotConnectionCredentialsAdmin(connection.id)
    if (!credentials) {
      return NextResponse.json({ error: 'Failed to retrieve HubSpot credentials' }, { status: 500 })
    }

    const client = createHubSpotClient({
      token: credentials.token,
      authType: credentials.authType,
      connectionId: credentials.connectionId,
      refreshToken: credentials.refreshToken || undefined,
      tokenExpiresAt: credentials.tokenExpiresAt,
    })

    const result = await client.getProperties(objectType)

    log.info(`Listed ${result.results.length} properties for ${objectType} workspace=${workspaceId}`)

    return NextResponse.json({
      properties: result.results.map((p) => ({
        name: p.name,
        label: p.label,
        type: p.type,
        fieldType: p.fieldType,
        groupName: p.groupName,
        description: p.description,
        hasUniqueValue: p.hasUniqueValue,
        hidden: p.hidden,
      })),
    })
  } catch (e) {
    log.error(`List properties failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST — Create a custom property on an object type.
 * Body: { session_id, object_type, name, label, type, field_type, group_name, description?, connection_id? }
 */
export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      session_id,
      object_type,
      name,
      label,
      type,
      field_type,
      group_name,
      description,
      connection_id,
    } = body

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }
    if (!object_type || !name || !label || !type || !field_type || !group_name) {
      return NextResponse.json(
        { error: 'Missing required fields: object_type, name, label, type, field_type, group_name' },
        { status: 400 }
      )
    }

    let workspaceId: string
    try {
      const session = await resolveSession(session_id)
      workspaceId = session.workspaceId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    const connection = await resolveHubSpotConnectionAdmin(workspaceId, connection_id)
    if (!connection) {
      return NextResponse.json({ error: 'No active HubSpot connection found' }, { status: 404 })
    }

    const credentials = await getHubSpotConnectionCredentialsAdmin(connection.id)
    if (!credentials) {
      return NextResponse.json({ error: 'Failed to retrieve HubSpot credentials' }, { status: 500 })
    }

    const client = createHubSpotClient({
      token: credentials.token,
      authType: credentials.authType,
      connectionId: credentials.connectionId,
      refreshToken: credentials.refreshToken || undefined,
      tokenExpiresAt: credentials.tokenExpiresAt,
    })

    const created = await client.createProperty(object_type, {
      name,
      label,
      type,
      fieldType: field_type,
      groupName: group_name,
      description,
    })

    log.info(`Created property "${name}" on ${object_type} for workspace=${workspaceId}`)

    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    log.error(`Create property failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
