'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSessions,
  getSessionEdaResults,
  getSessionWebsiteResult,
  getTableColumns,
  saveConfirmedJoins,
  updateWebsiteExploration,
  type JoinPair,
} from '@/lib/api/explorations'
import type { WebsiteExplorationResult } from '@/lib/agent/types'

export function useExplorationSessions(workspaceId: string | undefined) {
  const query = useQuery({
    queryKey: ['explorations', 'sessions', workspaceId],
    queryFn: () => getSessions(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  // Poll when any session is running
  const hasRunning = query.data?.some(s => s.status === 'running' || s.status === 'created')

  return useQuery({
    queryKey: ['explorations', 'sessions', workspaceId],
    queryFn: () => getSessions(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: hasRunning ? 5_000 : false,
  })
}

export function useSessionEdaResults(workspaceId: string | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: ['explorations', 'eda', workspaceId, sessionId],
    queryFn: () => getSessionEdaResults(workspaceId!, sessionId!),
    enabled: !!workspaceId && !!sessionId,
    staleTime: 60_000,
  })
}

export function useSessionWebsiteResult(workspaceId: string | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: ['explorations', 'website', workspaceId, sessionId],
    queryFn: () => getSessionWebsiteResult(workspaceId!, sessionId!),
    enabled: !!workspaceId && !!sessionId,
    staleTime: 60_000,
  })
}

export function useTableColumns(workspaceId: string | undefined, tableId: string | undefined) {
  return useQuery({
    queryKey: ['explorations', 'columns', workspaceId, tableId],
    queryFn: () => getTableColumns(workspaceId!, tableId!),
    enabled: !!workspaceId && !!tableId,
    staleTime: Infinity,
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
