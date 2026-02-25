/**
 * GET /api/integrations/posthog/mappings
 * Get PostHog property mappings (plan/segment/revenue) for the workspace.
 *
 * PUT /api/integrations/posthog/mappings
 * Replace all mappings for a given type (upsert).
 *
 * Query params:
 *   type: 'plan' | 'segment' | 'revenue' (optional filter)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withRLSContext, type RLSContext } from '@/lib/middleware'

async function handleGet(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context
  const mappingType = request.nextUrl.searchParams.get('type')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySupabase = supabase as any

  let query = anySupabase
    .from('posthog_property_mappings')
    .select('id, mapping_type, posthog_property, property_value, mapped_label, mapped_value, sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: true })

  if (mappingType) {
    query = query.eq('mapping_type', mappingType)
  }

  const { data, error } = await query

  if (error) {
    console.error('[PostHog Mappings] Query failed:', error)
    return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 })
  }

  return NextResponse.json({ mappings: data || [] })
}

async function handlePut(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySupabase = supabase as any

  let body: {
    mappings: Array<{
      mapping_type: 'plan' | 'segment' | 'revenue'
      posthog_property: string
      property_value: string
      mapped_label: string
      mapped_value?: number | null
      sort_order?: number
    }>
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.mappings)) {
    return NextResponse.json({ error: 'mappings array is required' }, { status: 400 })
  }

  // Validate mapping types
  const validTypes = ['plan', 'segment', 'revenue']
  for (const m of body.mappings) {
    if (!validTypes.includes(m.mapping_type)) {
      return NextResponse.json(
        { error: `Invalid mapping_type: ${m.mapping_type}` },
        { status: 400 }
      )
    }
    if (!m.posthog_property || !m.property_value || !m.mapped_label) {
      return NextResponse.json(
        { error: 'posthog_property, property_value, and mapped_label are required' },
        { status: 400 }
      )
    }
  }

  // Get the distinct mapping types being updated
  const typesBeingUpdated = [...new Set(body.mappings.map(m => m.mapping_type))]

  // Delete existing mappings for these types, then insert new ones
  for (const type of typesBeingUpdated) {
    const { error: deleteError } = await anySupabase
      .from('posthog_property_mappings')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('mapping_type', type)

    if (deleteError) {
      console.error(`[PostHog Mappings] Delete failed for type ${type}:`, deleteError)
      return NextResponse.json({ error: 'Failed to update mappings' }, { status: 500 })
    }
  }

  // Insert new mappings
  if (body.mappings.length > 0) {
    const rows = body.mappings.map((m, idx) => ({
      workspace_id: workspaceId,
      mapping_type: m.mapping_type,
      posthog_property: m.posthog_property,
      property_value: m.property_value,
      mapped_label: m.mapped_label,
      mapped_value: m.mapped_value ?? null,
      sort_order: m.sort_order ?? idx,
    }))

    const { data, error: insertError } = await anySupabase
      .from('posthog_property_mappings')
      .insert(rows)
      .select()

    if (insertError) {
      console.error('[PostHog Mappings] Insert failed:', insertError)
      return NextResponse.json({ error: 'Failed to save mappings' }, { status: 500 })
    }

    return NextResponse.json({ mappings: data })
  }

  return NextResponse.json({ mappings: [] })
}

export const GET = withRLSContext(handleGet)
export const PUT = withRLSContext(handlePut)
