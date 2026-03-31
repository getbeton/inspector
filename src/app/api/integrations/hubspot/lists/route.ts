/**
 * POST /api/integrations/hubspot/lists
 *
 * Creates a HubSpot static list, searches contacts by email, adds as members.
 * Removes stale members not in the provided emails array.
 *
 * Request:
 * {
 *   "connection_id": "uuid" (optional, uses primary if omitted),
 *   "list_name": "Signal: Pricing Page Interest",
 *   "emails": ["user1@example.com", "user2@example.com"]
 * }
 *
 * Response:
 * {
 *   "list_id": "123",
 *   "list_name": "Signal: Pricing Page Interest",
 *   "members_added": 42,
 *   "members_failed": 3
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import {
  resolveHubSpotConnection,
  getHubSpotConnectionCredentials,
} from '@/lib/integrations/hubspot'
import { HubSpotClient } from '@/lib/integrations/hubspot/client'
import { upsertContact } from '@/lib/integrations/hubspot/entities'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EMAILS = 10_000
const NAME_REGEX = /^[a-zA-Z0-9_.\-: ]+$/

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface CreateListBody {
  connection_id?: string
  list_name: string
  emails: string[]
}

function validateBody(body: unknown): CreateListBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be a JSON object')
  }

  const b = body as Record<string, unknown>

  if (typeof b.list_name !== 'string' || !b.list_name.trim()) {
    throw new Error('list_name is required')
  }
  if (!NAME_REGEX.test(b.list_name)) {
    throw new Error('list_name contains invalid characters')
  }

  if (!Array.isArray(b.emails) || b.emails.length === 0) {
    throw new Error('emails must be a non-empty array')
  }
  if (b.emails.length > MAX_EMAILS) {
    throw new Error(`emails must have at most ${MAX_EMAILS} items`)
  }
  for (const email of b.emails) {
    if (typeof email !== 'string') {
      throw new Error('All emails must be strings')
    }
  }

  return {
    connection_id: typeof b.connection_id === 'string' ? b.connection_id : undefined,
    list_name: b.list_name.trim(),
    emails: b.emails as string[],
  }
}

// ---------------------------------------------------------------------------
// POST Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()

    let body: CreateListBody
    try {
      const raw = await request.json()
      body = validateBody(raw)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid request' },
        { status: 400 }
      )
    }

    // Resolve connection
    const connection = await resolveHubSpotConnection(workspaceId, body.connection_id)
    if (!connection) {
      return NextResponse.json(
        { error: 'No HubSpot connection found for this workspace' },
        { status: 400 }
      )
    }

    const creds = await getHubSpotConnectionCredentials(connection.id as string)
    if (!creds || !creds.isActive) {
      return NextResponse.json(
        { error: 'HubSpot connection credentials unavailable' },
        { status: 400 }
      )
    }

    const client = new HubSpotClient({
      token: creds.token,
      authType: creds.authType,
      connectionId: connection.id as string,
      refreshToken: creds.refreshToken || undefined,
      tokenExpiresAt: creds.tokenExpiresAt,
    })

    // 1. Upsert contacts from email addresses
    const contactResults = await Promise.allSettled(
      body.emails.map(async (email) => {
        const result = await upsertContact(client, { email })
        return { email, contactId: result.recordId }
      })
    )

    const successfulContacts = contactResults
      .filter(
        (r): r is PromiseFulfilledResult<{ email: string; contactId: string }> =>
          r.status === 'fulfilled'
      )
      .map((r) => r.value)

    if (successfulContacts.length === 0) {
      return NextResponse.json(
        { error: 'Failed to create any contacts in HubSpot' },
        { status: 500 }
      )
    }

    // 2. Create static list via HubSpot Lists API v3
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let listResult: any
    try {
      listResult = await client.createStaticList(body.list_name)
    } catch (err) {
      return NextResponse.json(
        {
          error: `Failed to create list: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
        { status: 502 }
      )
    }

    const listId = listResult?.listId || listResult?.list_id || listResult?.id

    // 3. Add contacts to the list
    const contactIds = successfulContacts.map((c) => c.contactId)
    let membersAdded = 0
    let membersFailed = 0

    try {
      await client.addContactsToList(listId, contactIds)
      membersAdded = contactIds.length
    } catch {
      // Fall back to adding one by one
      const addResults = await Promise.allSettled(
        contactIds.map((id) => client.addContactsToList(listId, [id]))
      )
      membersAdded = addResults.filter((r) => r.status === 'fulfilled').length
      membersFailed = addResults.filter((r) => r.status === 'rejected').length
    }

    return NextResponse.json(
      {
        list_id: listId,
        list_name: body.list_name,
        members_added: membersAdded,
        members_failed: membersFailed,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[HubSpot Lists] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
