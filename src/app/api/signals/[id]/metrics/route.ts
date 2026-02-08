/**
 * GET /api/signals/[id]/metrics
 *
 * Retrieve calculated metrics for a signal.
 * Returns match count, conversion rate, and lift from signal_aggregates.
 * If metrics are still being calculated, returns status: 'calculating'.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'

export async function GET(
  _request: NextRequest,
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

    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Fetch the signal to get its type
    const { data: signal, error: signalError } = await supabase
      .from('signals')
      .select('id, type, details, workspace_id')
      .eq('id', id)
      .eq('workspace_id', membership.workspaceId)
      .single() as { data: { id: string; type: string; details: Record<string, unknown>; workspace_id: string } | null; error: unknown }

    if (signalError || !signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }

    // Fetch aggregated metrics
    const { data: metrics } = await supabase
      .from('signal_aggregates')
      .select('*')
      .eq('workspace_id', membership.workspaceId)
      .eq('signal_type', signal.type)
      .single() as { data: Record<string, unknown> | null; error: unknown }

    if (!metrics) {
      return NextResponse.json({
        status: 'calculating',
        signal_id: id,
        signal_type: signal.type,
        metrics: null,
      })
    }

    return NextResponse.json({
      status: 'ready',
      signal_id: id,
      signal_type: signal.type,
      metrics: {
        total_count: metrics.total_count,
        count_7d: metrics.count_last_7d,
        count_30d: metrics.count_last_30d,
        lift: metrics.avg_lift,
        conversion_rate: metrics.avg_conversion_rate,
        confidence: metrics.confidence_score,
        sample_size: metrics.sample_size,
        calculated_at: metrics.last_calculated_at,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/signals/[id]/metrics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
