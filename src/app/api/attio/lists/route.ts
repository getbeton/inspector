/**
 * POST /api/attio/lists
 *
 * Secure proxy for creating Attio lists and adding people.
 * Attio API key never leaves the server.
 *
 * Flow:
 * 1. Upsert person records from email addresses
 * 2. Create a new list
 * 3. Add each person to the list
 *
 * Request:
 * {
 *   "name": "Signal: Pricing Page Interest",
 *   "emails": ["user1@example.com", "user2@example.com"]
 * }
 *
 * Response:
 * {
 *   "list_id": "attio-list-uuid",
 *   "list_name": "Signal: Pricing Page Interest",
 *   "entries_added": 42,
 *   "entries_failed": 3
 * }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { ConfigurationError } from '@/lib/errors/query-errors'
import {
  createList,
  upsertPersonRecords,
  addListEntry,
} from '@/lib/integrations/attio/client'

const MAX_EMAILS = 10000
const NAME_REGEX = /^[a-zA-Z0-9_.\-: ]+$/

interface CreateAttioListBody {
  name: string
  emails: string[]
}

function validateBody(body: unknown): CreateAttioListBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be a JSON object')
  }

  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string' || !b.name.trim()) {
    throw new Error('name is required')
  }
  if (!NAME_REGEX.test(b.name)) {
    throw new Error('name contains invalid characters')
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
    name: b.name.trim(),
    emails: b.emails as string[],
  }
}

async function getAttioApiKey(workspaceId: string): Promise<string> {
  const credentials = await getIntegrationCredentials(workspaceId, 'attio')

  if (!credentials) {
    throw new ConfigurationError(
      'Attio integration is not configured. Please configure Attio in Settings.'
    )
  }
  if (!credentials.isActive) {
    throw new ConfigurationError('Attio integration is disabled.')
  }
  if (credentials.status !== 'connected' && credentials.status !== 'validating') {
    throw new ConfigurationError(`Attio integration status is "${credentials.status}".`)
  }
  if (!credentials.apiKey) {
    throw new ConfigurationError('Attio API key is missing.')
  }

  return credentials.apiKey
}

async function handleCreateAttioList(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { workspaceId } = context

  let body: CreateAttioListBody
  try {
    const raw = await request.json()
    body = validateBody(raw)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request' },
      { status: 400 }
    )
  }

  // Decrypt Attio credentials server-side
  const apiKey = await getAttioApiKey(workspaceId)

  // 1. Upsert person records (maps emails → Attio record IDs)
  const personRecords = await upsertPersonRecords(apiKey, body.emails)

  if (personRecords.length === 0) {
    return NextResponse.json(
      { error: 'Failed to create any person records in Attio' },
      { status: 500 }
    )
  }

  // 2. Create list
  const list = await createList(apiKey, body.name, 'people')

  // 3. Add each person to the list
  const entryResults = await Promise.allSettled(
    personRecords.map(p => addListEntry(apiKey, list.listId, p.recordId))
  )

  const entriesAdded = entryResults.filter(r => r.status === 'fulfilled').length
  const entriesFailed = entryResults.filter(r => r.status === 'rejected').length

  return NextResponse.json({
    list_id: list.listId,
    list_name: list.listName,
    entries_added: entriesAdded,
    entries_failed: entriesFailed,
  }, { status: 201 })
}

export const POST = withErrorHandler(withRLSContext(handleCreateAttioList))
