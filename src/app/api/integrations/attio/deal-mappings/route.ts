/**
 * GET /api/integrations/attio/deal-mappings
 * Get Attio deal pipeline/stage → conversion mappings for the workspace.
 *
 * PUT /api/integrations/attio/deal-mappings
 * Replace all deal mappings (upsert).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withRLSContext, type RLSContext } from '@/lib/middleware'

async function handleGet(
  _request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySupabase = supabase as any

  const { data, error } = await anySupabase
    .from('attio_deal_mappings')
    .select('id, attio_pipeline_id, attio_pipeline_name, attio_stage_id, attio_stage_name, stage_type, revenue_attribute_id, revenue_attribute_name')
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('[Attio Deal Mappings] Query failed:', error)
    return NextResponse.json({ error: 'Failed to fetch deal mappings' }, { status: 500 })
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
      attio_pipeline_id: string
      attio_pipeline_name?: string | null
      attio_stage_id: string
      attio_stage_name?: string | null
      stage_type: 'won' | 'lost' | 'open'
      revenue_attribute_id?: string | null
      revenue_attribute_name?: string | null
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

  // Validate
  const validStageTypes = ['won', 'lost', 'open']
  for (const m of body.mappings) {
    if (!m.attio_pipeline_id || !m.attio_stage_id) {
      return NextResponse.json(
        { error: 'attio_pipeline_id and attio_stage_id are required' },
        { status: 400 }
      )
    }
    if (!validStageTypes.includes(m.stage_type)) {
      return NextResponse.json(
        { error: `Invalid stage_type: ${m.stage_type}` },
        { status: 400 }
      )
    }
  }

  // Replace all mappings: delete existing, insert new
  const { error: deleteError } = await anySupabase
    .from('attio_deal_mappings')
    .delete()
    .eq('workspace_id', workspaceId)

  if (deleteError) {
    console.error('[Attio Deal Mappings] Delete failed:', deleteError)
    return NextResponse.json({ error: 'Failed to update deal mappings' }, { status: 500 })
  }

  if (body.mappings.length > 0) {
    const rows = body.mappings.map(m => ({
      workspace_id: workspaceId,
      attio_pipeline_id: m.attio_pipeline_id,
      attio_pipeline_name: m.attio_pipeline_name ?? null,
      attio_stage_id: m.attio_stage_id,
      attio_stage_name: m.attio_stage_name ?? null,
      stage_type: m.stage_type,
      revenue_attribute_id: m.revenue_attribute_id ?? null,
      revenue_attribute_name: m.revenue_attribute_name ?? null,
    }))

    const { data, error: insertError } = await anySupabase
      .from('attio_deal_mappings')
      .insert(rows)
      .select()

    if (insertError) {
      console.error('[Attio Deal Mappings] Insert failed:', insertError)
      return NextResponse.json({ error: 'Failed to save deal mappings' }, { status: 500 })
    }

    return NextResponse.json({ mappings: data })
  }

  return NextResponse.json({ mappings: [] })
}

export const GET = withRLSContext(handleGet)
export const PUT = withRLSContext(handlePut)
