/**
 * POST /api/agent/hubspot/entities
 *
 * Agent endpoint to create a chain of company -> contact -> deal with associations.
 * Uses batchCreateChain() from lib/integrations/hubspot/entities.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin, getHubSpotConnectionCredentialsAdmin } from '@/lib/integrations/hubspot/config'
import { createHubSpotClient } from '@/lib/integrations/hubspot/client'
import { batchCreateChain } from '@/lib/integrations/hubspot/entities'

const log = createModuleLogger('[API][Agent][HubSpot][Entities]')

export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      session_id,
      create_company,
      create_contact,
      create_deal,
      company_data,
      contact_data,
      deal_data,
      connection_id,
    } = body

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    if (!create_company && !create_contact && !create_deal) {
      return NextResponse.json(
        { error: 'At least one of create_company, create_contact, create_deal must be true' },
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

    // Rate limit
    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    // Resolve connection using admin client
    const connection = await resolveHubSpotConnectionAdmin(workspaceId, connection_id)
    if (!connection) {
      return NextResponse.json(
        { error: 'No active HubSpot connection found for this workspace' },
        { status: 404 }
      )
    }

    // Get credentials via admin client (bypasses RLS)
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

    const result = await batchCreateChain(client, {
      portalId: credentials.hubId,
      createCompany: !!create_company,
      createContact: !!create_contact,
      createDeal: !!create_deal,
      companyData: company_data || {},
      contactData: contact_data || {},
      dealData: deal_data || {},
    })

    log.info(`Entity chain created for workspace=${workspaceId}`)

    if (result.error && !result.partial) {
      return NextResponse.json(result, { status: 500 })
    }

    return NextResponse.json(result, { status: result.partial ? 207 : 201 })
  } catch (e) {
    log.error(`Entity chain failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
