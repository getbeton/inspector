/**
 * GET /api/agent/sessions/joins
 *
 * Get confirmed table join relationships from agent exploration sessions.
 * Reads completed sessions and EDA join_suggestions for the workspace.
 *
 * Supports both user auth (withRLSContext) and agent auth (validateAgentRequest).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

async function handleGetConfirmedJoins(
  _request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { workspaceId } = context

  // Use admin client for cross-table joins that RLS blocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createAdminClient() as any

  // Fetch completed sessions
  const { data: sessions, error: sessionsError } = await adminSupabase
    .from('workspace_agent_sessions')
    .select('session_id, status, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  if (sessionsError) {
    console.error('[Joins] Failed to fetch sessions:', sessionsError)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }

  // Collect confirmed joins from EDA results
  const { data: edaResults } = await adminSupabase
    .from('eda_results')
    .select('table_id, join_suggestions')
    .eq('workspace_id', workspaceId)

  const joins: Array<{ table_id: string; suggestions: unknown }> = []
  if (edaResults) {
    for (const result of edaResults) {
      if (result.join_suggestions) {
        joins.push({
          table_id: result.table_id,
          suggestions: result.join_suggestions,
        })
      }
    }
  }

  return NextResponse.json({
    confirmed_joins: joins,
    session_count: sessions?.length || 0,
  })
}

export const GET = withErrorHandler(withRLSContext(handleGetConfirmedJoins))
