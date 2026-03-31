/**
 * Vercel Cron: HubSpot Sync
 *
 * Syncs HubSpot CRM data for all active connections.
 * Triggered by Vercel Cron scheduler.
 *
 * Security: Requires CRON_SECRET header for authentication.
 *
 * POST /api/cron/hubspot-sync
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncConnection, type ConnectionSyncResult } from '@/lib/integrations/hubspot/polling'
import { createModuleLogger } from '@/lib/utils/logger'
import { verifyCronAuth } from '@/lib/middleware/cron-auth'

const log = createModuleLogger('[Cron HubSpot Sync]')

// Maximum execution time for Vercel Pro (5 minutes)
export const maxDuration = 300

/**
 * POST /api/cron/hubspot-sync
 *
 * Iterates all active HubSpot connections and syncs each one.
 * Respects the 5-minute Vercel execution limit by tracking elapsed time.
 */
export async function POST(request: Request) {
  const startTime = Date.now()

  // Verify cron secret
  if (!verifyCronAuth(request)) {
    log.error('Unauthorized request — invalid or missing CRON_SECRET')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  log.info('HubSpot sync job started')

  try {
    const supabase = createAdminClient()

    // Get all active, connected HubSpot connections
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: connections, error: fetchError } = await (supabase as any)
      .from('hubspot_connections')
      .select('id, workspace_id, hub_id, name')
      .eq('is_active', true)
      .eq('status', 'connected')
      .order('created_at', { ascending: true })

    if (fetchError) {
      log.error('Failed to fetch HubSpot connections:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch connections', details: String(fetchError) },
        { status: 500 }
      )
    }

    if (!connections || connections.length === 0) {
      log.info('No active HubSpot connections found')
      return NextResponse.json({
        success: true,
        duration_ms: Date.now() - startTime,
        summary: {
          connections_processed: 0,
          total_records_synced: 0,
          total_errors: 0,
        },
      })
    }

    log.info(`Processing ${connections.length} HubSpot connections`)

    const results: ConnectionSyncResult[] = []
    let totalRecords = 0
    let totalErrors = 0

    // Process each connection sequentially
    for (const conn of connections) {
      // Check if we're approaching the time limit (leave 30s buffer)
      const elapsed = Date.now() - startTime
      const remainingMs = (maxDuration * 1000) - elapsed - 30_000
      if (remainingMs <= 0) {
        log.warn(
          `Approaching time limit after ${elapsed}ms, ` +
          `skipping remaining ${connections.length - results.length} connections`
        )
        break
      }

      try {
        log.info(`Syncing connection ${conn.id} (hub: ${conn.hub_id}, name: ${conn.name})`)
        const result = await syncConnection(conn.id)
        results.push(result)
        totalRecords += result.totalRecordsSynced
        totalErrors += result.totalErrors
      } catch (err) {
        log.error(`Error syncing connection ${conn.id}:`, err)
        totalErrors++
        results.push({
          connectionId: conn.id,
          hubId: conn.hub_id,
          results: [],
          totalRecordsSynced: 0,
          totalErrors: 1,
          durationMs: 0,
        })
      }
    }

    const duration = Date.now() - startTime
    log.info(
      `HubSpot sync completed in ${duration}ms: ` +
      `${totalRecords} records synced across ${results.length} connections`
    )

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      summary: {
        connections_processed: results.length,
        total_records_synced: totalRecords,
        total_errors: totalErrors,
      },
      connections: results.map((r) => ({
        connection_id: r.connectionId,
        hub_id: r.hubId,
        records_synced: r.totalRecordsSynced,
        errors: r.totalErrors,
        duration_ms: r.durationMs,
        objects: r.results.map((o) => ({
          type: o.objectType,
          records: o.recordsSynced,
          status: o.status,
          error: o.error,
        })),
      })),
    })
  } catch (err) {
    const duration = Date.now() - startTime
    log.error('HubSpot sync job failed:', err)

    return NextResponse.json(
      {
        success: false,
        duration_ms: duration,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
