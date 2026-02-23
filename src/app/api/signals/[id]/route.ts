import { createClient, createClientFromRequest } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Signal, Account, HeuristicScore } from '@/lib/supabase/types'

type SignalWithAccount = Signal & { accounts: Pick<Account, 'id' | 'name' | 'domain' | 'arr' | 'plan' | 'status' | 'health_score' | 'fit_score' | 'last_activity_at'> | null }

/**
 * GET /api/signals/[id]
 * Get a specific signal or signal definition with related data.
 * Checks both signal_definitions and signals tables.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const hasBearerToken = request.headers.get('authorization')?.startsWith('Bearer ')
    const supabase = hasBearerToken
      ? await createClientFromRequest(request)
      : await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySupabase = supabase as any

    // Try signal_definitions first (custom signals)
    const { data: definition } = await anySupabase
      .from('signal_definitions')
      .select('*')
      .eq('id', id)
      .single()

    if (definition) {
      // It's a signal definition — return definition metadata + metrics
      const { data: metricsData } = await anySupabase
        .from('signal_aggregates')
        .select('*')
        .eq('workspace_id', definition.workspace_id)
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
      .eq('workspace_id', signal.workspace_id)
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
  } catch (error) {
    console.error('Error in GET /api/signals/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/signals/[id]
 * Delete a signal or signal definition
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const hasBearerToken = request.headers.get('authorization')?.startsWith('Bearer ')
    const supabase = hasBearerToken
      ? await createClientFromRequest(request)
      : await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySupabase = supabase as any

    // Try deleting from signal_definitions first
    const { data: deletedDef } = await anySupabase
      .from('signal_definitions')
      .delete()
      .eq('id', id)
      .select('id')
      .single()

    if (deletedDef) {
      return NextResponse.json({ success: true })
    }

    // Not a definition — try signals table
    const { error } = await anySupabase.from('signals').delete().eq('id', id)

    if (error) {
      console.error('Error deleting signal:', error)
      return NextResponse.json({ error: 'Failed to delete signal' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/signals/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
