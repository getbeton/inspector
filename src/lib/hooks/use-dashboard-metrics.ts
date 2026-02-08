'use client'

import { useQuery } from '@tanstack/react-query'

export interface RecentSignal {
  id: string
  type: string
  source: string
  accountName: string | null
  timestamp: string
}

export interface DashboardMetrics {
  totalSignals: number
  activeSignals: number
  totalAccounts: number
  avgLift: number
  recentSignals?: RecentSignal[]
}

async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const res = await fetch('/api/signals/dashboard/metrics?include_recent=true', {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to fetch dashboard metrics')
  const data = await res.json()

  // Map the API response shape to the hook's interface
  const metrics = data.metrics || data
  return {
    totalSignals: metrics.total_signals ?? metrics.totalSignals ?? 0,
    activeSignals: metrics.signals_this_period ?? metrics.activeSignals ?? 0,
    totalAccounts: metrics.total_accounts ?? metrics.totalAccounts ?? 0,
    avgLift: metrics.avg_health_score ?? metrics.avgLift ?? 0,
    recentSignals: data.recent_signals ?? undefined,
  }
}

export const dashboardMetricsKeys = {
  all: ['dashboard', 'metrics'] as const,
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: dashboardMetricsKeys.all,
    queryFn: fetchDashboardMetrics,
    staleTime: 60_000,
  })
}
