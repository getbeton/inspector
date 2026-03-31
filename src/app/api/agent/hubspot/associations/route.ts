/**
 * POST /api/agent/hubspot/associations
 *
 * Agent endpoint to create a single association between two HubSpot CRM records.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin, getHubSpotConnectionCredentialsAdmin } from '@/lib/integrations/hubspot/config'
import { createHubSpotClient } from '@/lib/integrations/hubspot/client'
import { createAssociation } from '@/lib/integrations/hubspot/associations'

const log = createModuleLogger('[API][Agent][HubSpot][Associations]')

export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      session_id,
      from_type,
      from_id,
      to_type,
      to_id,
      association_type_id,
      connection_id,
    } = body

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }
    if (!from_type || !from_id || !to_type || !to_id) {
      return NextResponse.json(
        { error: 'Missing required fields: from_type, from_id, to_type, to_id' },
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

    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    const connection = await resolveHubSpotConnectionAdmin(workspaceId, connection_id)
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

    await createAssociation(
      client,
      from_type,
      from_id,
      to_type,
      to_id,
      association_type_id
    )

    log.info(`Created association ${from_type}/${from_id} -> ${to_type}/${to_id} for workspace=${workspaceId}`)

    return NextResponse.json({ success: true })
  } catch (e) {
    log.error(`Association creation failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
