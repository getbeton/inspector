/**
 * Vercel Cron: Sync Signals
 *
 * Runs every 6 hours to refresh auto-update sync targets.
 * For each signal with auto_update targets:
 * 1. Re-runs the HogQL query to get fresh distinct_ids
 * 2. Updates PostHog cohort membership (re-upload CSV)
 * 3. Syncs Attio list entries (add new, remove stale)
 *
 * Security: Requires CRON_SECRET header for authentication.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials'
import { getPostHogHost } from '@/lib/integrations/posthog/regions'
import {
  upsertPersonRecords,
  syncListEntries,
} from '@/lib/integrations/attio/client'
import { verifyCronAuth } from '@/lib/middleware/cron-auth'

export const maxDuration = 300

const OPERATOR_SQL: Record<string, string> = {
  gte: '>=',
  gt: '>',
  eq: '=',
  lt: '<',
  lte: '<=',
}

export async function GET(request: Request) {
  // Verify cron secret (fail-closed: rejects if CRON_SECRET is unset)
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const results: Array<{ signalId: string; status: string; error?: string }> = []

  try {
    // Find all sync configs that have at least one auto_update target
    // Note: Tables not yet in generated types — using `as any` client until types regenerated
    const { data: syncConfigs, error: configError } = await supabase
      .from('signal_sync_configs')
      .select(`
        id,
        signal_id,
        workspace_id,
        event_names,
        condition_operator,
        condition_value,
        time_window_days,
        signal_sync_targets!inner (
          id,
          target_type,
          external_id,
          auto_update
        )
      `)
      .eq('signal_sync_targets.auto_update', true) as { data: unknown; error: unknown }

    if (configError || !syncConfigs) {
      console.error('[Sync Signals] Failed to fetch sync configs:', configError)
      return NextResponse.json({
        error: 'Failed to fetch sync configs',
        results,
      }, { status: 500 })
    }

    const configs = syncConfigs as Array<{
      id: string
      signal_id: string
      workspace_id: string
      event_names: string[]
      condition_operator: string
      condition_value: number
      time_window_days: number
      signal_sync_targets: Array<{
        id: string
        target_type: string
        external_id: string
        auto_update: boolean
      }>
    }>

    for (const config of configs) {
      try {
        // Get PostHog credentials for this workspace
        const posthogCreds = await getIntegrationCredentialsAdmin(
          config.workspace_id,
          'posthog'
        )

        if (!posthogCreds?.apiKey || !posthogCreds?.projectId) {
          results.push({
            signalId: config.signal_id,
            status: 'skipped',
            error: 'PostHog not configured',
          })
          continue
        }

        const client = new PostHogClient({
          apiKey: posthogCreds.apiKey,
          projectId: posthogCreds.projectId,
          host: getPostHogHost(posthogCreds.region),
        })

        // Re-run query to get fresh distinct_ids
        const eventList = config.event_names.map(n => `'${n}'`).join(', ')
        const opSql = OPERATOR_SQL[config.condition_operator] || '>='

        const query = `
          SELECT distinct_id
          FROM events
          WHERE event IN (${eventList})
            AND timestamp >= now() - interval ${config.time_window_days} day
          GROUP BY distinct_id
          HAVING count() ${opSql} ${config.condition_value}
        `

        const queryResult = await client.query(query, { timeoutMs: 60_000 })
        const distinctIds = (queryResult.results || []).map(row => String(row[0]))

        // Process each auto_update target
        const autoTargets = config.signal_sync_targets.filter(t => t.auto_update)

        for (const target of autoTargets) {
          try {
            if (target.target_type === 'posthog_cohort') {
              // Re-upload CSV to update cohort membership
              await client.updateStaticCohort(
                Number(target.external_id),
                distinctIds
              )
            } else if (target.target_type === 'attio_list') {
              // Sync Attio list entries
              const attioCreds = await getIntegrationCredentialsAdmin(
                config.workspace_id,
                'attio'
              )

              if (attioCreds?.apiKey) {
                // Map distinct_ids (emails) to Attio record IDs
                const personRecords = await upsertPersonRecords(
                  attioCreds.apiKey,
                  distinctIds
                )
                const recordIds = personRecords.map(p => p.recordId)

                await syncListEntries(
                  attioCreds.apiKey,
                  target.external_id,
                  recordIds
                )
              }
            }

            // Update last_synced_at on the target
            await supabase
              .from('signal_sync_targets')
              .update({
                last_synced_at: new Date().toISOString(),
                sync_error: null,
              } as never)
              .eq('id', target.id)
          } catch (targetErr) {
            const errMsg = targetErr instanceof Error ? targetErr.message : 'Unknown error'
            console.error(`[Sync Signals] Target ${target.id} failed:`, errMsg)

            // Record error on the target
            await supabase
              .from('signal_sync_targets')
              .update({ sync_error: errMsg } as never)
              .eq('id', target.id)
          }
        }

        // Update last_synced_at on the config
        await supabase
          .from('signal_sync_configs')
          .update({ last_synced_at: new Date().toISOString() } as never)
          .eq('id', config.id)

        results.push({ signalId: config.signal_id, status: 'synced' })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[Sync Signals] Config ${config.id} failed:`, errMsg)
        results.push({ signalId: config.signal_id, status: 'error', error: errMsg })
      }
    }

    return NextResponse.json({
      synced: results.filter(r => r.status === 'synced').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    })
  } catch (err) {
    console.error('[Sync Signals] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
