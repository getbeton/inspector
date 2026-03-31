/**
 * GET /api/agent/hubspot/objects
 *
 * Agent endpoint to list CRM object schemas (contacts, companies, deals, etc.).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin, getHubSpotConnectionCredentialsAdmin } from '@/lib/integrations/hubspot/config'
import { createHubSpotClient } from '@/lib/integrations/hubspot/client'

const log = createModuleLogger('[API][Agent][HubSpot][Objects]')

export async function GET(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('session_id')
    const connectionId = searchParams.get('connection_id') || undefined

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
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
      return NextResponse.json(
        { error: 'No active HubSpot connection found' },
        { status: 404 }
      )
    }

    const credentials = await getHubSpotConnectionCredentialsAdmin(connection.id)
    if (!credentials) {
      return NextResponse.json(
        { error: 'Failed to retrieve HubSpot credentials' },
        { status: 500 }
      )
    }

    const client = createHubSpotClient({
      token: credentials.token,
      authType: credentials.authType,
      connectionId: credentials.connectionId,
      refreshToken: credentials.refreshToken || undefined,
      tokenExpiresAt: credentials.tokenExpiresAt,
    })

    const schemas = await client.getObjectSchemas()

    log.info(`Listed ${schemas.results.length} object schemas for workspace=${workspaceId}`)

    return NextResponse.json({
      objects: schemas.results.map((s) => ({
        id: s.id,
        name: s.name,
        labels: s.labels,
        primaryDisplayProperty: s.primaryDisplayProperty,
        archived: s.archived,
      })),
    })
  } catch (e) {
    log.error(`List objects failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
