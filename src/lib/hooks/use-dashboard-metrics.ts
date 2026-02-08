'use client'

import { useQuery } from '@tanstack/react-query'

export interface DashboardMetrics {
  totalSignals: number
  activeSignals: number
  totalAccounts: number
  avgLift: number
}

async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const res = await fetch('/api/signals/dashboard/metrics', {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to fetch dashboard metrics')
  return res.json()
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
