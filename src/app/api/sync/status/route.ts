import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/supabase/server'

/**
 * GET /api/sync/status
 *
 * Returns latest sync status per type for the authenticated user's workspace.
 * Query params:
 *   - sync_type: specific type to check (returns single entry)
 *   - all=true: returns latest entry for each known sync type
 */
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()
    const supabase = await createClient()
    const url = new URL(request.url)

    const syncType = url.searchParams.get('sync_type')
    const all = url.searchParams.get('all') === 'true'

    if (syncType) {
      // Return latest entry for a specific sync type
      const { data, error } = await supabase
        .from('workspace_sync_log' as never)
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('sync_type', syncType)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows — that's fine
        return NextResponse.json({ error: 'Failed to fetch sync status' }, { status: 500 })
      }

      return NextResponse.json({ entry: data ?? null })
    }

    if (all) {
      // Return latest entry per known sync type
      const SYNC_TYPES = ['signal_detection', 'mtu_tracking', 'sync_signals', 'posthog_events']
      const entries = []

      for (const type of SYNC_TYPES) {
        const { data } = await supabase
          .from('workspace_sync_log' as never)
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('sync_type', type)
          .order('started_at', { ascending: false })
          .limit(1)
          .single()

        if (data) {
          entries.push(data)
        }
      }

      return NextResponse.json({ entries })
    }

    return NextResponse.json({ error: 'Provide sync_type or all=true' }, { status: 400 })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
