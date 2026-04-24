import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Account, SignalTypesSummaryResult } from '@/lib/supabase/types'

/**
 * GET /api/signals/dashboard/metrics
 * Workspace-level dashboard metrics. Computes directly from tables — the old
 * `get_dashboard_metrics` RPC was removed alongside the heuristics scoring
 * layer (it referenced the dropped accounts.health_score column).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const lookbackDays = parseInt(searchParams.get('days') || '30')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const { data: signalSummaryData } = await supabase.rpc('get_signal_types_summary', {
      p_workspace_id: membership.workspaceId,
      p_lookback_days: lookbackDays,
    } as never)

    const signalSummary = signalSummaryData as SignalTypesSummaryResult[] | null

    const lookbackDate = new Date()
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays)

    const { data: accountsData } = await supabase
      .from('accounts')
      .select('id, status, arr')
      .eq('workspace_id', membership.workspaceId)

    const accounts = accountsData as Pick<Account, 'id' | 'status' | 'arr'>[] | null

    const { count: totalSignals } = await supabase
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', membership.workspaceId)

    const { count: recentSignals } = await supabase
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', membership.workspaceId)
      .gte('timestamp', lookbackDate.toISOString())

    const totalAccounts = accounts?.length || 0
    const activeAccounts = accounts?.filter((a) => a.status === 'active').length || 0
    const totalArr = accounts?.reduce((sum, a) => sum + (a.arr || 0), 0) || 0

    const metrics = {
      total_accounts: totalAccounts,
      active_accounts: activeAccounts,
      total_signals: totalSignals || 0,
      signals_this_period: recentSignals || 0,
      total_arr: totalArr,
      expansion_opportunities: 0,
      churn_risks: 0,
    }

    const includeRecent = searchParams.get('include_recent') === 'true'
    let recentSignalsList:
      | Array<{
          id: string
          type: string
          source: string
          accountName: string | null
          timestamp: string
        }>
      | undefined

    if (includeRecent) {
      const { data: recentData } = await supabase
        .from('signals')
        .select('id, type, source, timestamp, accounts(name)')
        .eq('workspace_id', membership.workspaceId)
        .order('timestamp', { ascending: false })
        .limit(5) as {
        data: Array<{
          id: string
          type: string
          source: string
          timestamp: string
          accounts: { name: string } | null
        }> | null
      }

      recentSignalsList = recentData?.map((s) => ({
        id: s.id,
        type: s.type,
        source: s.source || 'manual',
        accountName: s.accounts?.name || null,
        timestamp: s.timestamp,
      }))
    }

    return NextResponse.json({
      metrics,
      signal_types: signalSummary || [],
      ...(recentSignalsList ? { recent_signals: recentSignalsList } : {}),
    })
  } catch (error) {
    console.error('Error in GET /api/signals/dashboard/metrics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
