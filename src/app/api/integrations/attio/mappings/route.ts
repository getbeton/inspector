/**
 * GET /api/integrations/attio/mappings
 * Get current PostHog-to-Attio field mappings from integration config.
 *
 * PUT /api/integrations/attio/mappings
 * Update field mappings. Merges new mappings with existing config_json.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import type { Json } from '@/lib/supabase/types'

async function handleGetMappings(
  _request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context

  const { data } = await supabase
    .from('integration_configs')
    .select('config_json')
    .eq('workspace_id', workspaceId)
    .eq('integration_name', 'attio')
    .single()

  if (!data) {
    return NextResponse.json({
      mappings: null,
      message: 'Attio integration not configured',
    })
  }

  const configJson = data.config_json as Record<string, Json>
  const mappings = configJson?.field_mappings || null

  return NextResponse.json({ mappings })
}

async function handleUpdateMappings(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context

  let body: { mappings: Record<string, string> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.mappings || typeof body.mappings !== 'object') {
    return NextResponse.json({ error: 'mappings object is required' }, { status: 400 })
  }

  // Get existing config
  const { data: existing } = await supabase
    .from('integration_configs')
    .select('id, config_json')
    .eq('workspace_id', workspaceId)
    .eq('integration_name', 'attio')
    .single()

  if (!existing) {
    return NextResponse.json(
      { error: 'Attio integration not configured. Connect Attio first.' },
      { status: 404 }
    )
  }

  // Merge new mappings into existing config_json
  const existingConfig = (existing.config_json as Record<string, Json>) || {}
  const updatedConfig = {
    ...existingConfig,
    field_mappings: body.mappings,
  }

  const { error } = await supabase
    .from('integration_configs')
    .update({ config_json: updatedConfig as Json })
    .eq('id', existing.id)

  if (error) {
    console.error('Failed to update mappings:', error)
    return NextResponse.json({ error: 'Failed to update mappings' }, { status: 500 })
  }

  return NextResponse.json({ success: true, mappings: body.mappings })
}

export const GET = withErrorHandler(withRLSContext(handleGetMappings))
export const PUT = withErrorHandler(withRLSContext(handleUpdateMappings))
