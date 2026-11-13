/**
 * POST /api/integrations/[name]/preview-impact
 *   ← { objectId, rows }
 *   → ImpactSummary
 *
 * Dry-run resolves each row against a sample of recent signals and
 * aggregates match/create counts. No writes. Used by ImpactPanel on save.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import {
  adapterFor,
  type Destination,
  type ImpactSummary,
  type MappingRow,
  type ObjectId,
} from '@/lib/field-mapping'
import { buildPayload } from '@/lib/field-mapping'
import { resolveAttioLinks } from '@/lib/field-mapping/resolve-links'

const VALID_DESTINATIONS: Destination[] = ['attio', 'hubspot']
const VALID_OBJECT_IDS: ObjectId[] = ['deals', 'people', 'companies', 'workspaces']
const MAX_SAMPLE = 25

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

  let body: { objectId?: string; rows?: MappingRow[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const objectIdRaw = body.objectId ?? ''
  if (!(VALID_OBJECT_IDS as string[]).includes(objectIdRaw)) {
    return NextResponse.json({ error: 'objectId invalid' }, { status: 400 })
  }
  const objectId = objectIdRaw as ObjectId
  const rows = Array.isArray(body.rows) ? body.rows : []

  const empty: ImpactSummary = { objectId, sampleSize: 0, byField: [] }

  // Link-impact preview is resolved via Attio's record-linking semantics
  // (`resolveAttioLinks`). Other destinations have no equivalent dry-run yet, so
  // they report no impact rather than fabricate one.
  if (destination !== 'attio') {
    return NextResponse.json(empty)
  }

  // Short-circuit when no link sources present — no impact to preview.
  const hasLinkingRow = rows.some(
    (r) =>
      r.source &&
      (r.source.type.startsWith('link_') || r.source.type.startsWith('actor_')),
  )
  if (!hasLinkingRow) {
    return NextResponse.json(empty)
  }

  const creds = await getIntegrationCredentials(ctx.workspaceId, 'attio')
  if (!creds) {
    return NextResponse.json(empty)
  }

  const adapter = adapterFor(destination, ctx)
  const subjects = await adapter.fetchSampleSubjects(ctx.workspaceId, objectId, {
    limit: MAX_SAMPLE,
  })
  const fields = await adapter.listFields(ctx.workspaceId, objectId)

  const fieldLabelById = new Map(fields.map((f) => [f.id, f.label]))
  const acc: Record<
    string,
    { fieldId: string; fieldLabel: string; matched: number; created: number; null: number; errors: number }
  > = {}
  const bucket = (fieldId: string) => {
    if (!acc[fieldId]) {
      acc[fieldId] = {
        fieldId,
        fieldLabel: fieldLabelById.get(fieldId) || fieldId,
        matched: 0,
        created: 0,
        null: 0,
        errors: 0,
      }
    }
    return acc[fieldId]
  }

  for (const subject of subjects) {
    const { payload } = buildPayload(rows, fields, subject)
    let outcomes: Awaited<ReturnType<typeof resolveAttioLinks>>['outcomes'] = []
    try {
      const r = await resolveAttioLinks(payload, fields, creds.apiKey, {
        autoLinkPersonToCompany: false, // preview only — no writes to Persons
      })
      outcomes = r.outcomes
    } catch {
      // Skip this subject; continue sampling.
      continue
    }
    for (const o of outcomes) {
      const b = bucket(o.fieldId)
      if (o.status === 'matched') b.matched += 1
      else if (o.status === 'created') b.created += 1
      else if (o.status === 'null') b.null += 1
      else if (o.status === 'error') b.errors += 1
    }
  }

  const summary: ImpactSummary = {
    objectId,
    sampleSize: subjects.length,
    byField: Object.values(acc),
  }
  return NextResponse.json(summary)
}

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ name: string }> }) => {
    const wrapped = withRLSContext((req, c) => handler(req, c, { params }))
    return wrapped(request)
  },
)
