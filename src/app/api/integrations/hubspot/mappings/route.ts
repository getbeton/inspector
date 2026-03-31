/**
 * GET/PUT /api/integrations/hubspot/mappings
 *
 * Manages field mappings between Beton computed fields and HubSpot properties.
 * Mappings are stored in the hubspot_connections.field_mappings JSONB column.
 *
 * GET: returns current field mappings for the primary (or specified) connection
 * PUT: updates field mappings for the specified connection
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { resolveHubSpotConnection } from '@/lib/integrations/hubspot'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// GET /api/integrations/hubspot/mappings
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()

    const connectionId = request.nextUrl.searchParams.get('connection_id') || undefined

    const connection = await resolveHubSpotConnection(workspaceId, connectionId)
    if (!connection) {
      return NextResponse.json(
        { error: 'No HubSpot connection found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      connection_id: connection.id,
      field_mappings: connection.field_mappings || {},
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[HubSpot Mappings GET] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT /api/integrations/hubspot/mappings
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()

    const body = await request.json()
    const { connection_id, field_mappings } = body

    if (!field_mappings || typeof field_mappings !== 'object') {
      return NextResponse.json(
        { error: 'field_mappings is required and must be an object' },
        { status: 400 }
      )
    }

    // Resolve and verify ownership
    const connection = await resolveHubSpotConnection(workspaceId, connection_id)
    if (!connection) {
      return NextResponse.json(
        { error: 'No HubSpot connection found' },
        { status: 404 }
      )
    }

    // Update the field_mappings JSONB column
    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('hubspot_connections')
      .update({ field_mappings: field_mappings })
      .eq('id', connection.id)
      .eq('workspace_id', workspaceId)

    if (error) {
      console.error('[HubSpot Mappings PUT] DB error:', error)
      return NextResponse.json(
        { error: 'Failed to save field mappings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      connection_id: connection.id,
      field_mappings,
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[HubSpot Mappings PUT] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
