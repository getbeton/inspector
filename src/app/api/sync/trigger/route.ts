import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const RATE_LIMIT_MINUTES = 5

const VALID_SYNC_TYPES = ['signal_detection', 'mtu_tracking', 'sync_signals', 'posthog_events'] as const
type SyncType = (typeof VALID_SYNC_TYPES)[number]

/**
 * POST /api/sync/trigger
 *
 * Triggers a manual sync for the user's workspace.
 * Rate limited: 1 per type per 5 minutes.
 *
 * Body: { sync_type: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()
    const body = await request.json()
    const syncType = body.sync_type as string

    if (!syncType || !VALID_SYNC_TYPES.includes(syncType as SyncType)) {
      return NextResponse.json(
        { error: `Invalid sync_type. Must be one of: ${VALID_SYNC_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Rate limit check: look for recent entries of same type
    const cutoff = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('workspace_sync_log' as never)
      .select('id, status, started_at')
      .eq('workspace_id', workspaceId)
      .eq('sync_type', syncType)
      .gte('started_at', cutoff)
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    if (recent) {
      const entry = recent as { id: string; status: string; started_at: string }
      if (entry.status === 'running') {
        return NextResponse.json(
          { error: 'A sync of this type is already running' },
          { status: 429 }
        )
      }
      return NextResponse.json(
        { error: `Please wait ${RATE_LIMIT_MINUTES} minutes between syncs of the same type` },
        { status: 429 }
      )
    }

    // Insert a new sync log entry
    const { data: logEntry, error: insertError } = await supabase
      .from('workspace_sync_log' as never)
      .insert({
        workspace_id: workspaceId,
        sync_type: syncType,
        status: 'running',
        triggered_by: 'manual',
      } as never)
      .select('id')
      .single()

    if (insertError || !logEntry) {
      console.error('[Sync Trigger] Failed to create sync log:', insertError)
      return NextResponse.json(
        { error: 'Failed to initiate sync' },
        { status: 500 }
      )
    }

    const logId = (logEntry as { id: string }).id

    // Execute the sync in the background (non-blocking).
    // We kick off the work and return immediately so the user sees "running" status.
    executeSyncInBackground(supabase, logId, workspaceId, syncType as SyncType)

    return NextResponse.json({
      message: 'Sync triggered',
      log_id: logId,
      sync_type: syncType,
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[Sync Trigger] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Execute the sync work and update the log entry on completion.
 * This runs asynchronously after the HTTP response is sent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeSyncInBackground(supabase: any, logId: string, workspaceId: string, syncType: SyncType) {
  const startTime = Date.now()

  try {
    let result: Record<string, unknown> = {}

    switch (syncType) {
      case 'signal_detection': {
        // Trigger signal detection for this workspace via the internal cron endpoint logic
        // For now, we call the cron endpoint with the cron secret
        const cronSecret = process.env.CRON_SECRET
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'

        const res = await fetch(`${baseUrl}/api/cron/signal-detection`, {
          method: 'GET',
          headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
        })
        result = res.ok ? await res.json() : { error: `Cron returned ${res.status}` }
        break
      }

      case 'mtu_tracking': {
        const cronSecret = process.env.CRON_SECRET
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'

        const res = await fetch(`${baseUrl}/api/cron/mtu-tracking`, {
          method: 'GET',
          headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
        })
        result = res.ok ? await res.json() : { error: `Cron returned ${res.status}` }
        break
      }

      case 'sync_signals': {
        const cronSecret = process.env.CRON_SECRET
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'

        const res = await fetch(`${baseUrl}/api/cron/sync-signals`, {
          method: 'GET',
          headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
        })
        result = res.ok ? await res.json() : { error: `Cron returned ${res.status}` }
        break
      }

      case 'posthog_events': {
        // Direct sync: fetch fresh events from PostHog, then run signal detection
        const cronSecret = process.env.CRON_SECRET
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'

        const res = await fetch(`${baseUrl}/api/cron/signal-detection`, {
          method: 'GET',
          headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
        })
        result = res.ok ? await res.json() : { error: `Cron returned ${res.status}` }
        break
      }
    }

    const durationMs = Date.now() - startTime

    await supabase
      .from('workspace_sync_log' as never)
      .update({
        completed_at: new Date().toISOString(),
        status: 'completed',
        result: { ...result, duration_ms: durationMs },
      } as never)
      .eq('id', logId)
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'

    await supabase
      .from('workspace_sync_log' as never)
      .update({
        completed_at: new Date().toISOString(),
        status: 'failed',
        error: errorMessage,
        result: { duration_ms: durationMs },
      } as never)
      .eq('id', logId)
  }
}
