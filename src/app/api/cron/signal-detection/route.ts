/**
 * Vercel Cron: Signal Detection (daily tracking pass)
 *
 * Runs daily at 6 AM UTC. For every workspace with a configured PostHog
 * integration, iterate all active `signal_definitions` rows (manual and
 * agent-emitted) and refresh their aggregate metrics in `signal_aggregates`.
 *
 * Discovery (deciding WHICH patterns are worth tracking) is no longer
 * Inspector's job — inspector-ml-backend owns it and writes new definitions
 * via `POST /api/agent/signals`. This cron is purely the tracking layer.
 *
 * Security: Requires CRON_SECRET header for authentication.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials'
import { getPostHogHost } from '@/lib/integrations/posthog/regions'
import { verifyCronAuth } from '@/lib/middleware/cron-auth'
import { upsertSignalMetrics } from '@/lib/signals/metrics-calculator'
import { evaluateDefinition, type EvaluatableDefinition } from '@/lib/signals/evaluator'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[Cron Signal Detection]')

export const maxDuration = 300

interface DefinitionRow extends EvaluatableDefinition {
  id: string
  workspace_id: string
  is_active: boolean | null
  status: string | null
}

export async function GET(request: Request) {
  const startTime = Date.now()

  if (!verifyCronAuth(request)) {
    log.error('Unauthorized request - invalid or missing CRON_SECRET')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  log.info('Signal tracking job started')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: workspaces, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id, slug') as { data: Array<{ id: string; slug: string }> | null; error: unknown }

  if (workspaceError || !workspaces) {
    log.error('Failed to fetch workspaces:', workspaceError)
    return NextResponse.json(
      { error: 'Failed to fetch workspaces', details: String(workspaceError) },
      { status: 500 },
    )
  }

  const results = {
    workspacesProcessed: 0,
    definitionsEvaluated: 0,
    definitionsFailed: 0,
    workspacesSkipped: 0,
    perWorkspace: [] as Array<{
      workspaceId: string
      slug: string
      evaluated: number
      failed: number
      skipped?: string
    }>,
  }

  for (const workspace of workspaces) {
    const workspaceResult = {
      workspaceId: workspace.id,
      slug: workspace.slug,
      evaluated: 0,
      failed: 0,
    }
    try {
      const posthogCreds = await getIntegrationCredentialsAdmin(workspace.id, 'posthog')
      if (!posthogCreds?.apiKey || !posthogCreds?.projectId) {
        results.workspacesSkipped++
        results.perWorkspace.push({ ...workspaceResult, skipped: 'PostHog not configured' })
        continue
      }

      const posthog = new PostHogClient({
        apiKey: posthogCreds.apiKey,
        projectId: posthogCreds.projectId,
        host: getPostHogHost(posthogCreds.region),
      })

      const { data: definitions, error: defError } = await supabase
        .from('signal_definitions')
        .select(
          'id, workspace_id, type, source, event_name, query_template, parameter_set, is_active, status',
        )
        .eq('workspace_id', workspace.id)
        .eq('is_active', true) as { data: DefinitionRow[] | null; error: unknown }

      if (defError || !definitions) {
        log.error(`Failed to fetch definitions for ${workspace.slug}:`, defError)
        results.workspacesSkipped++
        results.perWorkspace.push({ ...workspaceResult, skipped: 'Failed to fetch definitions' })
        continue
      }

      for (const definition of definitions) {
        if (definition.status === 'rejected' || definition.status === 'candidate') {
          continue
        }
        try {
          const matchCount = await evaluateDefinition(posthog, definition)
          await upsertSignalMetrics(supabase, workspace.id, definition.type, matchCount)
          workspaceResult.evaluated++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.error(`Definition ${definition.id} (${definition.type}) failed: ${msg}`)
          workspaceResult.failed++
        }
      }

      results.workspacesProcessed++
      results.definitionsEvaluated += workspaceResult.evaluated
      results.definitionsFailed += workspaceResult.failed
      results.perWorkspace.push(workspaceResult)
    } catch (err) {
      log.error(`Workspace ${workspace.slug} failed:`, err)
      results.workspacesSkipped++
      results.perWorkspace.push({
        ...workspaceResult,
        skipped: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const duration = Date.now() - startTime
  log.info(
    `Signal tracking completed in ${duration}ms: ` +
      `${results.definitionsEvaluated} evaluated, ${results.definitionsFailed} failed, ` +
      `${results.workspacesSkipped} workspaces skipped`,
  )

  return NextResponse.json({
    success: true,
    duration_ms: duration,
    summary: {
      workspaces_processed: results.workspacesProcessed,
      workspaces_skipped: results.workspacesSkipped,
      definitions_evaluated: results.definitionsEvaluated,
      definitions_failed: results.definitionsFailed,
    },
    workspaces: results.perWorkspace,
  })
}
