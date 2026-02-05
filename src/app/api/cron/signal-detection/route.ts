/**
 * Vercel Cron: Signal Detection
 *
 * Runs daily at 6 AM UTC to detect signals for all accounts.
 * Triggered by Vercel Cron scheduler.
 *
 * Security: Requires CRON_SECRET header for authentication.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processAllAccounts, getDetectorSummary } from '@/lib/heuristics/signals'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[Cron Signal Detection]')

// Maximum execution time for Vercel Pro (5 minutes)
export const maxDuration = 300

/**
 * GET /api/cron/signal-detection
 *
 * Triggered by Vercel Cron on schedule defined in vercel.json
 */
export async function GET(request: Request) {
  const startTime = Date.now()

  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    log.error('Unauthorized request - invalid CRON_SECRET')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  log.info('Signal detection job started')
  log.debug(`Available detectors: ${getDetectorSummary().length}`)

  try {
    const supabase = await createClient()

    // Get all workspaces
    const { data: workspaces, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, slug') as { data: Array<{ id: string; slug: string }> | null; error: unknown }

    if (workspaceError || !workspaces) {
      log.error('Failed to fetch workspaces:', workspaceError)
      return NextResponse.json(
        { error: 'Failed to fetch workspaces', details: String(workspaceError) },
        { status: 500 }
      )
    }

    log.info(`Processing ${workspaces.length} workspaces`)

    const results = {
      workspacesProcessed: 0,
      totalAccountsProcessed: 0,
      totalSignalsDetected: 0,
      totalSignalsPersisted: 0,
      totalErrors: 0,
      workspaceResults: [] as Array<{
        workspaceId: string
        slug: string
        accounts: number
        detected: number
        persisted: number
        errors: number
      }>,
    }

    // Process each workspace
    for (const workspace of workspaces) {
      try {
        log.debug(`Processing workspace: ${workspace.slug}`)

        const workspaceResult = await processAllAccounts(supabase, workspace.id, {
          category: 'all',
          limit: 500, // Process up to 500 accounts per workspace
        })

        results.workspacesProcessed++
        results.totalAccountsProcessed += workspaceResult.processed
        results.totalSignalsDetected += workspaceResult.totalDetected
        results.totalSignalsPersisted += workspaceResult.totalPersisted
        results.totalErrors += workspaceResult.totalErrors

        results.workspaceResults.push({
          workspaceId: workspace.id,
          slug: workspace.slug,
          accounts: workspaceResult.processed,
          detected: workspaceResult.totalDetected,
          persisted: workspaceResult.totalPersisted,
          errors: workspaceResult.totalErrors,
        })

        log.debug(
          `Workspace ${workspace.slug}: ${workspaceResult.processed} accounts, ${workspaceResult.totalDetected} signals detected`
        )
      } catch (err) {
        log.error(`Error processing workspace ${workspace.slug}:`, err)
        results.totalErrors++
      }
    }

    const duration = Date.now() - startTime
    log.info(`Signal detection completed in ${duration}ms`)
    log.info(`Summary: ${results.totalSignalsPersisted} signals persisted across ${results.totalAccountsProcessed} accounts`)

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      summary: {
        workspaces_processed: results.workspacesProcessed,
        accounts_processed: results.totalAccountsProcessed,
        signals_detected: results.totalSignalsDetected,
        signals_persisted: results.totalSignalsPersisted,
        errors: results.totalErrors,
      },
      workspaces: results.workspaceResults,
    })
  } catch (err) {
    const duration = Date.now() - startTime
    log.error('Signal detection job failed:', err)

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
