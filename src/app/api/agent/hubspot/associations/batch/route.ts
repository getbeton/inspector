/**
 * POST /api/agent/hubspot/associations/batch
 *
 * Agent endpoint to batch create associations between HubSpot CRM records.
 * Maximum 2000 associations per request.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin, getHubSpotConnectionCredentialsAdmin } from '@/lib/integrations/hubspot/config'
import { createHubSpotClient } from '@/lib/integrations/hubspot/client'
import { batchCreateAssociations, type AssociationInput } from '@/lib/integrations/hubspot/associations'

const log = createModuleLogger('[API][Agent][HubSpot][BatchAssociations]')

const MAX_BATCH_SIZE = 2000

export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { session_id, associations, connection_id } = body

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }
    if (!Array.isArray(associations) || associations.length === 0) {
      return NextResponse.json(
        { error: 'associations must be a non-empty array' },
        { status: 400 }
      )
    }
    if (associations.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_SIZE} associations per batch. Received ${associations.length}.` },
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

    // Map input to AssociationInput format
    const inputs: AssociationInput[] = associations.map(
      (a: {
        from_type: string
        from_id: string
        to_type: string
        to_id: string
        association_type_id?: number
      }) => ({
        fromType: a.from_type,
        fromId: a.from_id,
        toType: a.to_type,
        toId: a.to_id,
        associationTypeId: a.association_type_id,
      })
    )

    const result = await batchCreateAssociations(client, inputs)

    log.info(
      `Batch associations: ${result.succeeded} succeeded, ${result.failed} failed ` +
      `for workspace=${workspaceId}`
    )

    return NextResponse.json(result)
  } catch (e) {
    log.error(`Batch associations failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
