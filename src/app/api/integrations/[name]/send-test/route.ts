/**
 * POST /api/integrations/[name]/send-test
 *   ← { objectId, rows, subjectId? }
 *   → SendTestResult
 *
 * Evaluates each row's source against the chosen subject (via the formula engine),
 * builds a payload, and writes a test record to the destination.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import {
  buildPayload,
  createAttioAdapter,
  type DestinationAdapter,
  type MappingRow,
  type ObjectId,
} from '@/lib/field-mapping'

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

  let body: { objectId?: string; rows?: MappingRow[]; subjectId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const objectIdRaw = body.objectId ?? ''
  if (!(VALID_OBJECT_IDS as string[]).includes(objectIdRaw)) {
    return NextResponse.json({ error: 'objectId is invalid' }, { status: 400 })
  }
  const objectId = objectIdRaw as ObjectId
  const rows = Array.isArray(body.rows) ? body.rows : []

  const adapter: DestinationAdapter = createAttioAdapter({ supabase: ctx.supabase })

  // Resolve test subject
  const subjects = await adapter.fetchSampleSubjects(ctx.workspaceId, objectId, { limit: 10 })
  const subject = body.subjectId
    ? subjects.find((s) => s.id === body.subjectId) ?? subjects[0] ?? null
    : subjects[0] ?? null

  // Fetch live field schema so we can map row.fieldId → payload keys in the right order.
  const fields = await adapter.listFields(ctx.workspaceId, objectId)

  const { payload, nullFields } = buildPayload(rows, fields, subject)

  const result = await adapter.sendTest(ctx.workspaceId, objectId, payload, rows)
  return NextResponse.json({ ...result, payload, nullFields, subject })
}

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ name: string }> }) => {
    const wrapped = withRLSContext((req, ctx) => handler(req, ctx, { params }))
    return wrapped(request)
  },
)
