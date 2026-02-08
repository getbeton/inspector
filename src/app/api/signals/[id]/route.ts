import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Signal, Account, HeuristicScore } from '@/lib/supabase/types'

type SignalWithAccount = Signal & { accounts: Pick<Account, 'id' | 'name' | 'domain' | 'arr' | 'plan' | 'status' | 'health_score' | 'fit_score' | 'last_activity_at'> | null }

/**
 * GET /api/signals/[id]
 * Get a specific signal with related data
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get signal with related account data
    const { data, error } = await supabase
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

    const { data: relatedData } = await supabase
      .from('signals')
      .select('id, type, value, timestamp, source')
      .eq('account_id', signal.account_id)
      .neq('id', id)
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(10)

    const relatedSignals = relatedData as Pick<Signal, 'id' | 'type' | 'value' | 'timestamp' | 'source'>[] | null

    // Get account's current heuristic scores
    const { data: scoresData } = await supabase
      .from('heuristic_scores')
      .select('score_type, score_value, calculated_at')
      .eq('account_id', signal.account_id)
      .order('calculated_at', { ascending: false })
      .limit(3)

    const scores = scoresData as Pick<HeuristicScore, 'score_type' | 'score_value' | 'calculated_at'>[] | null

    // Get calculated metrics from signal_aggregates
    const { data: metricsData } = await supabase
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
 * Delete a signal
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // RLS handles workspace isolation
    const { error } = await supabase.from('signals').delete().eq('id', id)

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
