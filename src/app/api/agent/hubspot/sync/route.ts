/**
 * POST /api/agent/hubspot/sync — trigger manual sync for specific object types
 * GET  /api/agent/hubspot/sync — return sync status per object type
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin } from '@/lib/integrations/hubspot/config'
import { syncObjectType } from '@/lib/integrations/hubspot/polling'
import { createHubSpotClientForConnection } from '@/lib/integrations/hubspot/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { STANDARD_OBJECT_TYPES, type HubSpotObjectType } from '@/lib/integrations/hubspot/types'

const log = createModuleLogger('[API][Agent][HubSpot][Sync]')

/**
 * POST — Trigger manual sync for specific object types.
 * Body: { session_id, object_types?, connection_id? }
 */
export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { session_id, object_types, connection_id } = body

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    let workspaceId: string
    try {
      const session = await resolveSession(session_id)
      workspaceId = session.workspaceId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    const connection = await resolveHubSpotConnectionAdmin(workspaceId, connection_id)
    if (!connection) {
      return NextResponse.json({ error: 'No active HubSpot connection found' }, { status: 404 })
    }

    // Check if any sync is already running
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: runningSync } = await (supabase as any)
      .from('hubspot_sync_state')
      .select('object_type, status')
      .eq('connection_id', connection.id)
      .eq('status', 'syncing')
      .limit(1)

    if (runningSync && runningSync.length > 0) {
      return NextResponse.json(
        { error: 'Sync already in progress', running: runningSync[0].object_type },
        { status: 409 }
      )
    }

    // Determine object types to sync
    const typesToSync: HubSpotObjectType[] = object_types && Array.isArray(object_types)
      ? object_types.filter((t: string) => STANDARD_OBJECT_TYPES.includes(t as HubSpotObjectType)) as HubSpotObjectType[]
      : [...STANDARD_OBJECT_TYPES]

    if (typesToSync.length === 0) {
      return NextResponse.json(
        { error: 'No valid object types specified' },
        { status: 400 }
      )
    }

    // Create client and trigger sync
    const client = await createHubSpotClientForConnection(connection.id)

    const results = []
    for (const objectType of typesToSync) {
      const result = await syncObjectType(client, connection.id, workspaceId, objectType)
      results.push(result)
    }

    log.info(`Manual sync triggered for workspace=${workspaceId}, types=${typesToSync.join(',')}`)

    return NextResponse.json({
      status: 'initiated',
      results,
    })
  } catch (e) {
    log.error(`Trigger sync failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * GET — Return sync status per object type.
 * Query params: session_id, connection_id?
 */
export async function GET(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('session_id')
    const connectionId = searchParams.get('connection_id') || undefined

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

    const connection = await resolveHubSpotConnectionAdmin(workspaceId, connectionId)
    if (!connection) {
      return NextResponse.json({ error: 'No active HubSpot connection found' }, { status: 404 })
    }

    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: syncStates, error } = await (supabase as any)
      .from('hubspot_sync_state')
      .select('object_type, status, last_sync_at, records_synced, last_error')
      .eq('connection_id', connection.id)
      .order('object_type')

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch sync status' }, { status: 500 })
    }

    log.info(`Sync status requested for workspace=${workspaceId}`)

    return NextResponse.json({
      connection_id: connection.id,
      hub_id: connection.hub_id,
      sync_states: syncStates || [],
    })
  } catch (e) {
    log.error(`Get sync status failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
