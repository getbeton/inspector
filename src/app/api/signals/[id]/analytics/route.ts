/**
 * GET /api/signals/[id]/analytics
 *
 * Returns pre-computed signal analytics for the detail page:
 * - KPI summary (users, conversions, revenue, significance)
 * - Monthly time-series snapshots
 * - Cohort retention data (M0-M8)
 * - Time-to-conversion curves (P0-P12)
 *
 * Query params:
 *   window: conversion window in days (7|14|30|60|90|none) — default 30
 *   range:  time range (3m|6m|12m|all) — default 12m
 *   plan:   filter by plan tier
 *   segment: filter by customer segment
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withRLSContext, type RLSContext } from '@/lib/middleware'

async function handleGet(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context
  const pathParts = request.nextUrl.pathname.split('/')
  // URL: /api/signals/[id]/analytics → id is at index -2
  const signalId = pathParts[pathParts.length - 2]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySupabase = supabase as any

  const params = request.nextUrl.searchParams
  const windowParam = params.get('window')
  const rangeParam = params.get('range') || '12m'

  // Parse conversion window
  const conversionWindow = windowParam === 'none'
    ? null
    : windowParam
      ? parseInt(windowParam, 10)
      : 30

  // Calculate date range
  const now = new Date()
  let rangeMonths = 12
  if (rangeParam === '3m') rangeMonths = 3
  else if (rangeParam === '6m') rangeMonths = 6
  else if (rangeParam === 'all') rangeMonths = 120 // 10 years

  const startDate = new Date(now)
  startDate.setMonth(startDate.getMonth() - rangeMonths)
  const startDateStr = startDate.toISOString().split('T')[0]

  // Verify signal exists and belongs to workspace
  const { data: definition, error: defError } = await anySupabase
    .from('signal_definitions')
    .select('id, name, type, conversion_type, retention_event_name')
    .eq('id', signalId)
    .eq('workspace_id', workspaceId)
    .single()

  if (defError || !definition) {
    return NextResponse.json(
      { error: 'Signal not found' },
      { status: 404 }
    )
  }

  // Fetch snapshots for the requested window and date range
  let snapshotsQuery = anySupabase
    .from('signal_analytics_snapshots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('signal_definition_id', signalId)
    .gte('month', startDateStr)
    .order('month', { ascending: true })

  if (conversionWindow === null) {
    snapshotsQuery = snapshotsQuery.is('conversion_window_days', null)
  } else {
    snapshotsQuery = snapshotsQuery.eq('conversion_window_days', conversionWindow)
  }

  const { data: snapshots, error: snapError } = await snapshotsQuery

  if (snapError) {
    console.error('[Analytics] Snapshots query failed:', snapError)
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    )
  }

  // Calculate KPI from snapshots (sum/average across the time range)
  const snapshotList = (snapshots || []) as Record<string, unknown>[]
  const kpi = computeKPI(snapshotList)

  // Fetch retention data
  const { data: retention } = await anySupabase
    .from('signal_cohort_retention')
    .select('tab, stat_mode, signal_values, nosignal_values')
    .eq('workspace_id', workspaceId)
    .eq('signal_definition_id', signalId)

  // Fetch conversion curves
  const { data: curves } = await anySupabase
    .from('signal_conversion_curves')
    .select('signal_period, nosignal_period, signal_cumulative, nosignal_cumulative')
    .eq('workspace_id', workspaceId)
    .eq('signal_definition_id', signalId)
    .single()

  // Determine available windows (which windows have data)
  const { data: windowRows } = await anySupabase
    .from('signal_analytics_snapshots')
    .select('conversion_window_days')
    .eq('workspace_id', workspaceId)
    .eq('signal_definition_id', signalId)

  const availableWindows = Array.from(
    new Set(
      ((windowRows || []) as { conversion_window_days: number | null }[])
        .map(r => r.conversion_window_days)
    )
  ).sort((a, b) => (a ?? 999) - (b ?? 999))

  return NextResponse.json({
    signal_definition_id: signalId,
    conversion_window_days: conversionWindow,
    kpi,
    snapshots: snapshotList.map(formatSnapshot),
    retention: (retention || []).map(formatRetention),
    conversion_curve: curves ? formatCurve(curves) : null,
    available_windows: availableWindows.length > 0
      ? availableWindows
      : [7, 14, 30, 60, 90, null], // default set if no data yet
  })
}

/** Compute KPI summary from snapshots (latest month values or aggregate) */
function computeKPI(snapshots: Record<string, unknown>[]) {
  if (snapshots.length === 0) {
    return {
      users_with_signal: 0,
      converted_users: 0,
      additional_net_revenue: 0,
      statistical_significance: null,
      p_value: null,
      conversion_rate: null,
    }
  }

  // Sum across all months in range
  let totalUsers = 0
  let totalConverted = 0
  let totalRevenue = 0

  for (const s of snapshots) {
    totalUsers += (s.users_with_signal as number) || 0
    totalConverted += (s.converted_users as number) || 0
    totalRevenue += (s.additional_net_revenue as number) || 0
  }

  // Use the latest month's significance/p-value
  const latest = snapshots[snapshots.length - 1]

  return {
    users_with_signal: totalUsers,
    converted_users: totalConverted,
    additional_net_revenue: totalRevenue,
    statistical_significance: (latest.statistical_significance as number) ?? null,
    p_value: (latest.p_value as number) ?? null,
    conversion_rate: totalUsers > 0
      ? Number(((totalConverted / totalUsers) * 100).toFixed(1))
      : null,
  }
}

function formatSnapshot(s: Record<string, unknown>) {
  return {
    id: s.id,
    month: s.month,
    conversion_window_days: s.conversion_window_days,
    users_with_signal: s.users_with_signal ?? 0,
    converted_users: s.converted_users ?? 0,
    additional_net_revenue: s.additional_net_revenue ?? 0,
    statistical_significance: s.statistical_significance ?? null,
    p_value: s.p_value ?? null,
    revenue_signal: s.revenue_signal ?? 0,
    revenue_other: s.revenue_other ?? 0,
    occurrences: s.occurrences ?? 0,
    conversion_rate_signal: s.conversion_rate_signal ?? null,
    conversion_rate_nosignal: s.conversion_rate_nosignal ?? null,
    acv_signal: s.acv_signal ?? null,
    acv_nosignal: s.acv_nosignal ?? null,
    customer_breakdown: s.customer_breakdown ?? [],
    computed_at: s.computed_at,
  }
}

function formatRetention(r: Record<string, unknown>) {
  return {
    tab: r.tab,
    stat_mode: r.stat_mode,
    signal_values: r.signal_values ?? [100],
    nosignal_values: r.nosignal_values ?? [100],
  }
}

function formatCurve(c: Record<string, unknown>) {
  return {
    signal_period: c.signal_period ?? [0],
    nosignal_period: c.nosignal_period ?? [0],
    signal_cumulative: c.signal_cumulative ?? [0],
    nosignal_cumulative: c.nosignal_cumulative ?? [0],
  }
}

export const GET = withRLSContext(handleGet)
