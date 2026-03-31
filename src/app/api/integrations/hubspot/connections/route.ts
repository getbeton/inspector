/**
 * GET  /api/integrations/hubspot/connections — List all HubSpot connections
 * POST /api/integrations/hubspot/connections — Create a new connection (admin use)
 *
 * Lists connections for the authenticated user's workspace.
 * Sensitive fields (encrypted tokens) are excluded from responses.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot Connections]')

/** Columns returned in list responses (exclude encrypted tokens) */
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

/**
 * GET: List all HubSpot connections for the workspace
 */
export async function GET() {
  try {
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
      .eq('workspace_id', membership.workspaceId)
      .order('created_at', { ascending: true })

    if (error) {
      log.error('Failed to list connections:', error)
      return NextResponse.json(
        { error: 'Failed to fetch connections' },
        { status: 500 }
      )
    }

    return NextResponse.json({ connections: data || [] })
  } catch (error) {
    log.error('GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST: Create a new HubSpot connection (manual/admin)
 *
 * This is primarily used for creating connections without going through
 * OAuth or validate flows. For most use cases, use the /validate or
 * /oauth/authorize endpoints instead.
 */
export async function POST(request: Request) {
  try {
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

    const body = await request.json()
    const { name = 'HubSpot', auth_type, config_json = {} } = body

    if (!auth_type || !['oauth', 'private_app'].includes(auth_type)) {
      return NextResponse.json(
        { error: 'auth_type must be "oauth" or "private_app"' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('hubspot_connections')
      .insert({
        workspace_id: membership.workspaceId,
        name,
        auth_type,
        config_json,
        status: 'pending',
      } as never)
      .select(SAFE_COLUMNS)
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A connection named "${name}" already exists` },
          { status: 409 }
        )
      }
      log.error('Failed to create connection:', error)
      return NextResponse.json(
        { error: 'Failed to create connection' },
        { status: 500 }
      )
    }

    return NextResponse.json({ connection: data }, { status: 201 })
  } catch (error) {
    log.error('POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
