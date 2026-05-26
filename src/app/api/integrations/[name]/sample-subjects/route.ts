/**
 * GET /api/integrations/[name]/sample-subjects?objectId=deals
 *   → { subjects: SampleSubject[] }
 *
 * Used by the SubjectPicker popover to populate the list of test subjects
 * for a given destination object.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import {
  adapterFor,
  type Destination,
  type ObjectId,
} from '@/lib/field-mapping'

const VALID_DESTINATIONS: Destination[] = ['attio', 'hubspot']
const VALID_OBJECT_IDS: ObjectId[] = ['deals', 'people', 'companies', 'workspaces']

function parseDestination(raw: string): Destination | null {
  return (VALID_DESTINATIONS as string[]).includes(raw) ? (raw as Destination) : null
}

async function handler(
  request: NextRequest,
  ctx: RLSContext,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params
  const destination = parseDestination(name)
  if (!destination) {
    return NextResponse.json({ error: `Unsupported destination "${name}"` }, { status: 400 })
  }

  const url = new URL(request.url)
  const objectIdParam = url.searchParams.get('objectId') ?? ''
  if (!(VALID_OBJECT_IDS as string[]).includes(objectIdParam)) {
    return NextResponse.json({ error: 'objectId is required' }, { status: 400 })
  }
  const objectId = objectIdParam as ObjectId
  const limit = parseLimit(url.searchParams.get('limit'))

  const adapter = adapterFor(destination, ctx)

  const subjects = await adapter.fetchSampleSubjects(ctx.workspaceId, objectId, { limit })
  return NextResponse.json({ subjects })
}

function parseLimit(raw: string | null): number {
  if (!raw) return 10
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return 10
  return Math.max(1, Math.min(50, n))
}

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ name: string }> }) => {
    const wrapped = withRLSContext((req, ctx) => handler(req, ctx, { params }))
    return wrapped(request)
  },
)
