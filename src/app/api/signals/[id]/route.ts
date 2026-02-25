/**
 * GET /api/signals/[id]
 * Get a specific signal or signal definition with related data.
 * Checks both signal_definitions and signals tables.
 *
 * DELETE /api/signals/[id]
 * Delete a signal or signal definition.
 *
 * Security fixes:
 * - C4: Cross-workspace read prevented by workspace_id filter + RLS context
 * - C5: Cross-workspace delete prevented by workspace_id filter + RLS context
 * - M11: Role enforcement on destructive operations (DELETE)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import type { Signal, Account, HeuristicScore } from '@/lib/supabase/types'

type SignalWithAccount = Signal & { accounts: Pick<Account, 'id' | 'name' | 'domain' | 'arr' | 'plan' | 'status' | 'health_score' | 'fit_score' | 'last_activity_at'> | null }

// ─── GET handler ──────────────────────────────────────────────────────────────

async function handleGet(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context
  const id = request.nextUrl.pathname.split('/').pop()!

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySupabase = supabase as any

  // Try signal_definitions first (custom signals)
  // C4 fix: Add workspace_id filter to prevent cross-workspace read
  const { data: definition } = await anySupabase
    .from('signal_definitions')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single()

  if (definition) {
    // It's a signal definition — return definition metadata + metrics
    const { data: metricsData } = await anySupabase
      .from('signal_aggregates')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('signal_type', definition.type)
      .single() as { data: Record<string, unknown> | null; error: unknown }

    const metrics = metricsData
      ? {
          total_count: metricsData.total_count as number,
          count_7d: metricsData.count_last_7d as number,
          count_30d: metricsData.count_last_30d as number,
          lift: metricsData.avg_lift as number | null,
          conversion_rate: metricsData.avg_conversion_rate as number | null,
          confidence: metricsData.confidence_score as number | null,
          sample_size: metricsData.sample_size as number | null,
          calculated_at: metricsData.last_calculated_at as string | null,
        }
      : null

    return NextResponse.json({
      signal: {
        ...definition,
        source: 'manual',
        is_definition: true,
      },
      metrics,
      related_signals: [],
      scores: []
    })
  }

  // Not a definition — try signals table (occurrence)
  // C4 fix: Add workspace_id filter
  const { data, error } = await anySupabase
    .from('signals')
    .select(`
      *,
      accounts (
        id,
        name,
        domain,
        arr,
        plan,
        status,
        health_score,
        fit_score,
        last_activity_at
      )
    `)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single()

  const signal = data as SignalWithAccount | null

  if (error || !signal) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
  }

  // Get related signals from same account (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: relatedData } = await anySupabase
    .from('signals')
    .select('id, type, value, timestamp, source')
    .eq('account_id', signal.account_id)
    .eq('workspace_id', workspaceId)
    .neq('id', id)
    .gte('timestamp', thirtyDaysAgo.toISOString())
    .order('timestamp', { ascending: false })
    .limit(10)

  const relatedSignals = relatedData as Pick<Signal, 'id' | 'type' | 'value' | 'timestamp' | 'source'>[] | null

  // Get account's current heuristic scores
  const { data: scoresData } = await anySupabase
    .from('heuristic_scores')
    .select('score_type, score_value, calculated_at')
    .eq('account_id', signal.account_id)
    .order('calculated_at', { ascending: false })
    .limit(3)

  const scores = scoresData as Pick<HeuristicScore, 'score_type' | 'score_value' | 'calculated_at'>[] | null

  // Get calculated metrics from signal_aggregates
  const { data: metricsData } = await anySupabase
    .from('signal_aggregates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('signal_type', signal.type)
    .single() as { data: Record<string, unknown> | null; error: unknown }

  const metrics = metricsData
    ? {
        total_count: metricsData.total_count as number,
        count_7d: metricsData.count_last_7d as number,
        count_30d: metricsData.count_last_30d as number,
        lift: metricsData.avg_lift as number | null,
        conversion_rate: metricsData.avg_conversion_rate as number | null,
        confidence: metricsData.confidence_score as number | null,
        sample_size: metricsData.sample_size as number | null,
        calculated_at: metricsData.last_calculated_at as string | null,
      }
    : null

  return NextResponse.json({
    signal,
    metrics,
    related_signals: relatedSignals || [],
    scores: scores || []
  })
}

// ─── DELETE handler ───────────────────────────────────────────────────────────

async function handleDelete(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId, role } = context
  const id = request.nextUrl.pathname.split('/').pop()!

  // M11 fix: Role enforcement on destructive operations
  if (!['admin', 'owner'].includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySupabase = supabase as any

  // Try deleting from signal_definitions first
  // C5 fix: Add workspace_id filter to prevent cross-workspace delete
  const { data: deletedDef } = await anySupabase
    .from('signal_definitions')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id')
    .single()

  if (deletedDef) {
    return NextResponse.json({ success: true })
  }

  // Not a definition — try signals table
  // C5 fix: Add workspace_id filter
  const { error } = await anySupabase
    .from('signals')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error deleting signal:', error)
    return NextResponse.json({ error: 'Failed to delete signal' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(withRLSContext(handleGet))
export const DELETE = withErrorHandler(withRLSContext(handleDelete))
