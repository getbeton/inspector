/**
 * GET    /api/integrations/hubspot/connections/[id] — Get a single connection
 * DELETE /api/integrations/hubspot/connections/[id] — Delete a connection
 *
 * Individual connection management. Sensitive fields excluded from GET responses.
 * DELETE cascades to sync state, cached records, and associations.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot Connection Detail]')

/** Columns returned in responses (exclude encrypted tokens) */
const SAFE_COLUMNS = [
  'id',
  'workspace_id',
  'name',
  'auth_type',
  'hub_id',
  'hub_domain',
  'account_name',
  'scopes',
  'config_json',
  'is_primary',
  'status',
  'last_validated_at',
  'last_error',
  'is_active',
  'created_at',
  'updated_at',
].join(',')

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * GET: Fetch a single HubSpot connection by ID
 */
export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('hubspot_connections')
      .select(SAFE_COLUMNS)
      .eq('id', id)
      .eq('workspace_id', membership.workspaceId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    return NextResponse.json({ connection: data })
  } catch (error) {
    log.error('GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE: Remove a HubSpot connection
 *
 * Cascading deletes will remove:
 * - hubspot_sync_state rows
 * - hubspot_records rows
 * - hubspot_associations rows
 */
export async function DELETE(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Verify the connection belongs to this workspace before deleting
    const { data: existing } = await supabase
      .from('hubspot_connections')
      .select('id')
      .eq('id', id)
      .eq('workspace_id', membership.workspaceId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('hubspot_connections')
      .delete()
      .eq('id', id)
      .eq('workspace_id', membership.workspaceId)

    if (error) {
      log.error('Failed to delete connection:', error)
      return NextResponse.json(
        { error: 'Failed to delete connection' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, deleted: id })
  } catch (error) {
    log.error('DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
