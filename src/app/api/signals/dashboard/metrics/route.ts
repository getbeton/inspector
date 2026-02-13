import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Account, Signal, DashboardMetricsResult, SignalTypesSummaryResult } from '@/lib/supabase/types'

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
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Call the database function for aggregated metrics
    const { data: dashboardMetrics, error: metricsError } = await supabase.rpc(
      'get_dashboard_metrics',
      {
        p_workspace_id: membership.workspaceId,
        p_lookback_days: lookbackDays
      } as never
    )

    if (metricsError) {
      console.error('Error fetching dashboard metrics:', metricsError)
      // Fall back to manual query if function doesn't exist
      return await getFallbackMetrics(supabase, membership.workspaceId, lookbackDays)
    }

    const metrics = dashboardMetrics as DashboardMetricsResult[] | null

    // Get signal types summary
    const { data: signalSummaryData } = await supabase.rpc('get_signal_types_summary', {
      p_workspace_id: membership.workspaceId,
      p_lookback_days: lookbackDays
    } as never)

    const signalSummary = signalSummaryData as SignalTypesSummaryResult[] | null

    // Optionally include recent signals for the dashboard
    const includeRecent = searchParams.get('include_recent') === 'true'
    let recentSignals: Array<{
      id: string
      type: string
      source: string
      accountName: string | null
      timestamp: string
    }> | undefined

    if (includeRecent) {
      const { data: recentData } = await supabase
        .from('signals')
        .select('id, type, source, timestamp, accounts(name)')
        .eq('workspace_id', membership.workspaceId)
        .order('timestamp', { ascending: false })
        .limit(5) as { data: Array<{
          id: string
          type: string
          source: string
          timestamp: string
          accounts: { name: string } | null
        }> | null }

      recentSignals = recentData?.map(s => ({
        id: s.id,
        type: s.type,
        source: s.source || 'heuristic',
        accountName: s.accounts?.name || null,
        timestamp: s.timestamp,
      }))
    }

    return NextResponse.json({
      metrics: metrics?.[0] || {},
      signal_types: signalSummary || [],
      ...(recentSignals ? { recent_signals: recentSignals } : {}),
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
  const { data: accountsData } = await supabase
    .from('accounts')
    .select('id, status, health_score, arr')
    .eq('workspace_id', workspaceId)

  const accounts = accountsData as Pick<Account, 'id' | 'status' | 'health_score' | 'arr'>[] | null

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
  const { data: signalTypesData } = await supabase
    .from('signals')
    .select('type')
    .eq('workspace_id', workspaceId)
    .gte('timestamp', lookbackDate.toISOString())

  const signalTypes = signalTypesData as Pick<Signal, 'type'>[] | null

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
    totalAccounts > 0
      ? (accounts?.reduce((sum, a) => sum + (a.health_score || 0), 0) || 0) / totalAccounts
      : 0
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
