/**
 * GET /api/agent/hubspot/connections
 *
 * Agent endpoint to list all HubSpot connections for a workspace.
 * Sensitive data (tokens) is excluded from the response.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { createAdminClient } from '@/lib/supabase/admin'

const log = createModuleLogger('[API][Agent][HubSpot][Connections]')

export async function GET(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('session_id')

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    let workspaceId: string
    try {
      const session = await resolveSession(sessionId)
      workspaceId = session.workspaceId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    const supabase = createAdminClient()

    // Fetch all connections, excluding sensitive token columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('hubspot_connections')
      .select(
        'id, name, auth_type, hub_id, hub_domain, account_name, scopes, ' +
        'config_json, is_primary, status, is_active, last_validated_at, ' +
        'last_error, created_at, updated_at'
      )
      .eq('workspace_id', workspaceId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      log.error('Failed to fetch connections:', error)
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
    }

    log.info(`Listed ${data?.length || 0} connections for workspace=${workspaceId}`)

    return NextResponse.json({ connections: data || [] })
  } catch (e) {
    log.error(`List connections failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
