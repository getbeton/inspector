/**
 * GET /api/integrations/[name]/records/search?objectId=people&q=jane
 *   → { results: [{ id, display, secondary? }] }
 *
 * Type-ahead backend for the SourcePicker "Pick a specific record…" control.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { searchRecordsForPicker } from '@/lib/integrations/attio/client'
import type { ObjectId } from '@/lib/field-mapping'

const OBJECT_TO_SLUG: Record<ObjectId, string> = {
  deals: 'deals',
  people: 'people',
  companies: 'companies',
  workspaces: 'workspaces',
}

const VALID_OBJECT_IDS: ObjectId[] = ['deals', 'people', 'companies', 'workspaces']

async function handler(
  request: NextRequest,
  ctx: RLSContext,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params
  if (name !== 'attio') {
    return NextResponse.json({ error: `Unsupported destination "${name}"` }, { status: 400 })
  }

  const url = new URL(request.url)
  const objectIdRaw = url.searchParams.get('objectId') ?? ''
  const q = (url.searchParams.get('q') ?? '').trim()

  if (!(VALID_OBJECT_IDS as string[]).includes(objectIdRaw)) {
    return NextResponse.json({ error: 'objectId is invalid' }, { status: 400 })
  }
  if (!q) {
    return NextResponse.json({ results: [] })
  }

  const creds = await getIntegrationCredentials(ctx.workspaceId, 'attio')
  if (!creds) {
    return NextResponse.json({ results: [] })
  }

  try {
    const results = await searchRecordsForPicker(
      creds.apiKey,
      OBJECT_TO_SLUG[objectIdRaw as ObjectId],
      q,
      10,
    )
    return NextResponse.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message, results: [] }, { status: 500 })
  }
}

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ name: string }> }) => {
    const wrapped = withRLSContext((req, c) => handler(req, c, { params }))
    return wrapped(request)
  },
)
