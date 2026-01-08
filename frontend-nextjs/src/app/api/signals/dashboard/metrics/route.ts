import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * GET /api/signals/dashboard/metrics
 * Get dashboard metrics for current workspace
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const lookbackDays = parseInt(searchParams.get('days') || '30')

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's workspace
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()

    if (!memberData) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Call the database function for aggregated metrics
    const { data: dashboardMetrics, error: metricsError } = await supabase.rpc(
      'get_dashboard_metrics',
      {
        p_workspace_id: memberData.workspace_id,
        p_lookback_days: lookbackDays
      }
    )

    if (metricsError) {
      console.error('Error fetching dashboard metrics:', metricsError)
      // Fall back to manual query if function doesn't exist
      return await getFallbackMetrics(supabase, memberData.workspace_id, lookbackDays)
    }

    // Get signal types summary
    const { data: signalSummary } = await supabase.rpc('get_signal_types_summary', {
      p_workspace_id: memberData.workspace_id,
      p_lookback_days: lookbackDays
    })

    return NextResponse.json({
      metrics: dashboardMetrics?.[0] || {},
      signal_types: signalSummary || []
    })
  } catch (error) {
    console.error('Error in GET /api/signals/dashboard/metrics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Fallback metrics query if database functions are not deployed
 */
async function getFallbackMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  lookbackDays: number
) {
  const lookbackDate = new Date()
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays)

  // Get account stats
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, status, health_score, arr')
    .eq('workspace_id', workspaceId)

  // Get signal stats
  const { count: totalSignals } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  const { count: recentSignals } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('timestamp', lookbackDate.toISOString())

  // Get signal type breakdown
  const { data: signalTypes } = await supabase
    .from('signals')
    .select('type')
    .eq('workspace_id', workspaceId)
    .gte('timestamp', lookbackDate.toISOString())

  // Aggregate signal types
  const typeCounts: Record<string, number> = {}
  signalTypes?.forEach((s) => {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1
  })

  const signalSummary = Object.entries(typeCounts)
    .map(([type, count]) => ({
      signal_type: type,
      count,
      avg_value: 0,
      latest_at: null
    }))
    .sort((a, b) => b.count - a.count)

  const totalAccounts = accounts?.length || 0
  const activeAccounts = accounts?.filter((a) => a.status === 'active').length || 0
  const avgHealthScore =
    accounts?.reduce((sum, a) => sum + (a.health_score || 0), 0) / totalAccounts || 0
  const totalArr = accounts?.reduce((sum, a) => sum + (a.arr || 0), 0) || 0

  return NextResponse.json({
    metrics: {
      total_accounts: totalAccounts,
      active_accounts: activeAccounts,
      total_signals: totalSignals || 0,
      signals_this_period: recentSignals || 0,
      avg_health_score: avgHealthScore,
      total_arr: totalArr,
      expansion_opportunities: 0,
      churn_risks: 0
    },
    signal_types: signalSummary
  })
}
