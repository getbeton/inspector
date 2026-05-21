/**
 * GET /api/integrations/[name]/field-mappings
 *   → { objects: ObjectSchema[], mappings: Record<ObjectId, MappingRow[]> }
 *
 * PUT /api/integrations/[name]/field-mappings
 *   ← { mappings: Record<ObjectId, MappingRow[]> }
 *   → { success: true }
 *
 * Validates every formula server-side before writing.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import {
  createAttioAdapter,
  createHubSpotDestinationAdapter,
  listMappings,
  replaceAllMappings,
  type Destination,
  type DestinationAdapter,
  type MappingRow,
  type ObjectId,
  type ObjectSchema,
  type Source,
} from '@/lib/field-mapping'
import { validateFormula } from '@/lib/formula'

const VALID_DESTINATIONS: Destination[] = ['attio', 'hubspot']

function parseDestination(raw: string): Destination | null {
  return (VALID_DESTINATIONS as string[]).includes(raw) ? (raw as Destination) : null
}

function adapterFor(destination: Destination, ctx: RLSContext): DestinationAdapter {
  if (destination === 'attio') return createAttioAdapter({ supabase: ctx.supabase })
  if (destination === 'hubspot') return createHubSpotDestinationAdapter({ supabase: ctx.supabase })
  throw new Error(`No adapter for destination "${destination}"`)
}

async function handleGet(
  request: NextRequest,
  ctx: RLSContext,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params
  const destination = parseDestination(name)
  if (!destination) {
    return NextResponse.json({ error: `Unsupported destination "${name}"` }, { status: 400 })
  }

  const adapter = adapterFor(destination, ctx)

  try {
    const [objects, mappings] = await Promise.all([
      adapter.listObjects(ctx.workspaceId),
      listMappings(ctx.supabase, ctx.workspaceId, destination),
    ])

    // Expand each object with its full field list (parallel).
    const objectsWithFields: ObjectSchema[] = await Promise.all(
      objects.map(async (obj) => ({
        ...obj,
        fields: await adapter.listFields(ctx.workspaceId, obj.id),
      })),
    )

    return NextResponse.json({ objects: objectsWithFields, mappings })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load mappings'
    // Degrade gracefully — if adapter is not connected, return empty so UI can render prompt.
    if (message.toLowerCase().includes('not connected')) {
      return NextResponse.json({ objects: [], mappings: {} })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function handlePut(
  request: NextRequest,
  ctx: RLSContext,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params
  const destination = parseDestination(name)
  if (!destination) {
    return NextResponse.json({ error: `Unsupported destination "${name}"` }, { status: 400 })
  }

  let body: { mappings?: Record<string, MappingRow[]> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const mappings = body.mappings ?? {}

  // Validate shape + formulas before touching the DB
  for (const [objectId, rows] of Object.entries(mappings)) {
    if (!Array.isArray(rows)) {
      return NextResponse.json(
        { error: `mappings.${objectId} must be an array` },
        { status: 400 },
      )
    }
    for (const row of rows) {
      const err = validateRow(objectId, row)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }
  }

  try {
    await replaceAllMappings(ctx.supabase, ctx.workspaceId, destination, mappings as Record<ObjectId, MappingRow[]>)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save mappings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function validateRow(objectId: string, row: MappingRow): string | null {
  if (!row || typeof row !== 'object') return `Invalid row in ${objectId}`
  if (!row.fieldId || typeof row.fieldId !== 'string') return `Row missing fieldId in ${objectId}`
  const src = row.source as Source | undefined
  if (!src) return null
  if (src.type === 'formula') {
    const r = validateFormula(src.expr)
    if (!r.ok) return `Invalid formula on ${objectId}.${row.fieldId}: ${r.reason}`
  }
  if (src.type === 'property' && !src.prop) {
    return `Property source missing prop on ${objectId}.${row.fieldId}`
  }
  if (src.type === 'option' && !src.value) {
    return `Option source missing value on ${objectId}.${row.fieldId}`
  }
  if (src.type === 'link_specific_record') {
    if (!src.targetObject || !src.recordId) {
      return `link_specific_record missing targetObject or recordId on ${objectId}.${row.fieldId}`
    }
  }
  // link_subject_*, actor_* carry no additional payload — nothing to validate here.
  return null
}

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ name: string }> }) => {
    const wrapped = withRLSContext((req, ctx) => handleGet(req, ctx, { params }))
    return wrapped(request)
  },
)

export const PUT = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ name: string }> }) => {
    const wrapped = withRLSContext((req, ctx) => handlePut(req, ctx, { params }))
    return wrapped(request)
  },
)
