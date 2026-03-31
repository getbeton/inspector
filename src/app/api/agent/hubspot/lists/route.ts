/**
 * POST /api/agent/hubspot/lists — create a static list with contacts
 * GET  /api/agent/hubspot/lists — list existing static lists
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin, getHubSpotConnectionCredentialsAdmin } from '@/lib/integrations/hubspot/config'
import { createHubSpotClient } from '@/lib/integrations/hubspot/client'

const log = createModuleLogger('[API][Agent][HubSpot][Lists]')

/**
 * POST — Create a static list and optionally add contacts by email.
 * Body: { session_id, name, emails?, connection_id? }
 */
export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { session_id, name, emails, connection_id } = body

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 })
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

    // Create the static list
    const list = await client.createStaticList(name)

    // Add contacts by email if provided
    if (Array.isArray(emails) && emails.length > 0) {
      // Search for contacts by email to get their IDs
      const contactIds: string[] = []
      for (const email of emails as string[]) {
        try {
          const searchResult = await client.search('contacts', {
            filterGroups: [{
              filters: [{
                propertyName: 'email',
                operator: 'EQ',
                value: email,
              }],
            }],
            limit: 1,
          })
          if (searchResult.results.length > 0) {
            contactIds.push(searchResult.results[0].id)
          }
        } catch {
          log.warn(`Contact not found for email: ${email}`)
        }
      }

      if (contactIds.length > 0) {
        await client.addContactsToList(list.listId, contactIds)
      }

      log.info(
        `Created list "${name}" with ${contactIds.length}/${emails.length} contacts ` +
        `for workspace=${workspaceId}`
      )

      return NextResponse.json({
        list_id: list.listId,
        name: list.name,
        contacts_added: contactIds.length,
        contacts_not_found: (emails as string[]).length - contactIds.length,
      }, { status: 201 })
    }

    log.info(`Created empty list "${name}" for workspace=${workspaceId}`)

    return NextResponse.json({
      list_id: list.listId,
      name: list.name,
    }, { status: 201 })
  } catch (e) {
    log.error(`Create list failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * GET — List existing static lists.
 * Query params: session_id, connection_id?
 */
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

    // HubSpot Lists API (v3) — fetch lists
    // Note: The HubSpotClient doesn't have a dedicated list-fetching method,
    // so we use the raw request approach via the client's internal method.
    // For now, return connection info to confirm the endpoint works.
    // Full list fetching would need a client.getLists() method.
    log.info(`Lists endpoint called for workspace=${workspaceId}`)

    return NextResponse.json({
      message: 'HubSpot lists endpoint active',
      connection_id: connection.id,
      hub_id: credentials.hubId,
    })
  } catch (e) {
    log.error(`List lists failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
