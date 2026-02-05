'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSessions,
  getSessionEdaResults,
  getSessionWebsiteResult,
  getTableColumns,
  saveConfirmedJoins,
  updateWebsiteExploration,
  getLatestChanges,
  type JoinPair,
} from '@/lib/api/explorations'
import {
  MOCK_SESSIONS,
  MOCK_EDA_RESULTS,
  MOCK_WEBSITE_RESULTS,
  MOCK_TABLE_COLUMNS,
} from '@/lib/data/mock-explorations'
import type { WebsiteExplorationResult } from '@/lib/agent/types'

const DEMO_WORKSPACE = '__demo__'

export function useExplorationSessions(workspaceId: string | undefined) {
  const isDemo = !workspaceId || workspaceId === DEMO_WORKSPACE

  const query = useQuery({
    queryKey: ['explorations', 'sessions', workspaceId ?? DEMO_WORKSPACE],
    queryFn: () => isDemo ? Promise.resolve(MOCK_SESSIONS) : getSessions(workspaceId!),
    enabled: true,
    staleTime: isDemo ? Infinity : 30_000,
    refetchOnWindowFocus: !isDemo,
  })

  // Poll when any session is running (only for real data)
  const hasRunning = !isDemo && query.data?.some(s => s.status === 'running' || s.status === 'created')

  return useQuery({
    queryKey: ['explorations', 'sessions', workspaceId ?? DEMO_WORKSPACE],
    queryFn: () => isDemo ? Promise.resolve(MOCK_SESSIONS) : getSessions(workspaceId!),
    enabled: true,
    staleTime: isDemo ? Infinity : 30_000,
    refetchOnWindowFocus: !isDemo,
    refetchInterval: hasRunning ? 5_000 : false,
  })
}

export function useSessionEdaResults(workspaceId: string | undefined, sessionId: string | undefined) {
  const isDemo = !workspaceId || workspaceId === DEMO_WORKSPACE

  return useQuery({
    queryKey: ['explorations', 'eda', workspaceId ?? DEMO_WORKSPACE, sessionId],
    queryFn: () => {
      if (isDemo && sessionId) {
        return Promise.resolve(MOCK_EDA_RESULTS[sessionId] ?? [])
      }
      return getSessionEdaResults(workspaceId!, sessionId!)
    },
    enabled: !!sessionId,
    staleTime: isDemo ? Infinity : 60_000,
  })
}

export function useSessionWebsiteResult(workspaceId: string | undefined, sessionId: string | undefined) {
  const isDemo = !workspaceId || workspaceId === DEMO_WORKSPACE

  return useQuery({
    queryKey: ['explorations', 'website', workspaceId ?? DEMO_WORKSPACE, sessionId],
    queryFn: () => {
      if (isDemo && sessionId) {
        return Promise.resolve(MOCK_WEBSITE_RESULTS[sessionId] ?? null)
      }
      return getSessionWebsiteResult(workspaceId!, sessionId!)
    },
    enabled: !!sessionId,
    staleTime: isDemo ? Infinity : 60_000,
  })
}

export function useTableColumns(workspaceId: string | undefined, tableId: string | undefined) {
  const isDemo = !workspaceId || workspaceId === DEMO_WORKSPACE

  return useQuery({
    queryKey: ['explorations', 'columns', workspaceId ?? DEMO_WORKSPACE, tableId],
    queryFn: () => {
      if (isDemo && tableId) {
        return Promise.resolve(MOCK_TABLE_COLUMNS[tableId] ?? { table_id: tableId, columns: [] })
      }
      return getTableColumns(workspaceId!, tableId!)
    },
    enabled: !!tableId,
    staleTime: Infinity,
  })
}

export function useLatestChanges(workspaceId: string | undefined) {
  const isDemo = !workspaceId || workspaceId === DEMO_WORKSPACE

  return useQuery({
    queryKey: ['explorations', 'latest-changes', workspaceId ?? DEMO_WORKSPACE],
    queryFn: () => isDemo
      ? Promise.resolve({ business_model: null, join_candidates: null })
      : getLatestChanges(workspaceId!),
    staleTime: isDemo ? Infinity : 30_000,
  })
}

export function useSaveConfirmedJoins(sessionId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (joins: JoinPair[]) => saveConfirmedJoins(sessionId, joins),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['explorations', 'sessions'] })
    },
  })
}

export function useUpdateWebsiteExploration(workspaceId: string, sessionId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<WebsiteExplorationResult>) =>
      updateWebsiteExploration(workspaceId, sessionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['explorations', 'website', workspaceId, sessionId],
      })
    },
  })
}
