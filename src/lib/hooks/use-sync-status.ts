'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface SyncStatusEntry {
  id: string
  sync_type: string
  started_at: string
  completed_at: string | null
  status: string
  result: Record<string, unknown> | null
  error: string | null
  triggered_by: string
}

/**
 * Fetch latest sync status for a given sync type.
 * Polls every 10s when a sync is running to detect completion.
 */
export function useSyncStatus(syncType: string) {
  return useQuery({
    queryKey: ['sync-status', syncType],
    queryFn: async (): Promise<SyncStatusEntry | null> => {
      const res = await fetch(`/api/sync/status?sync_type=${encodeURIComponent(syncType)}`)
      if (!res.ok) return null
      const data = await res.json()
      return data.entry ?? null
    },
    staleTime: 30_000,
    refetchInterval: (query) => {
      // Poll more frequently while a sync is running
      const status = query.state.data?.status
      return status === 'running' ? 5_000 : 60_000
    },
    refetchOnWindowFocus: true,
  })
}

/**
 * Fetch all sync statuses (latest per type) for the sync dashboard.
 */
export function useAllSyncStatuses() {
  return useQuery({
    queryKey: ['sync-status', 'all'],
    queryFn: async (): Promise<SyncStatusEntry[]> => {
      const res = await fetch('/api/sync/status?all=true')
      if (!res.ok) return []
      const data = await res.json()
      return data.entries ?? []
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

/**
 * Mutation to trigger a manual sync. Rate limited to 1 per type per 5 minutes.
 */
export function useTriggerSync() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ syncType }: { syncType: string }) => {
      const res = await fetch('/api/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_type: syncType }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Sync trigger failed (${res.status})`)
      }
      return res.json()
    },
    onSuccess: (_data, { syncType }) => {
      queryClient.invalidateQueries({ queryKey: ['sync-status', syncType] })
      queryClient.invalidateQueries({ queryKey: ['sync-status', 'all'] })
    },
  })
}
