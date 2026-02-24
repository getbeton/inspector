'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getQueryHistory,
  getQueryDetail,
  type QueryHistoryFilters,
} from '@/lib/api/query-history'

/**
 * Paginated list of query execution history.
 *
 * - When workspaceId is undefined: returns empty list (setup not complete)
 * - Real mode: cursor-based pagination, 30s staleTime, auto-refetch on window focus
 */
export function useQueryHistory(
  workspaceId: string | undefined,
  filters: QueryHistoryFilters = {}
) {
  return useQuery({
    queryKey: [
      'query-history',
      'list',
      workspaceId ?? '',
      filters.cursor ?? '',
      filters.status ?? '',
      filters.sessionId ?? '',
    ],
    queryFn: () => getQueryHistory(workspaceId!, filters),
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

/**
 * Detail view for a single query — includes full query text + result data.
 *
 * Lazy-loaded: only fires when `queryId` is truthy (triggered by row click).
 * Results are immutable after creation, so staleTime is 5 minutes.
 */
export function useQueryDetail(queryId: string | undefined) {
  return useQuery({
    queryKey: ['query-history', 'detail', queryId],
    queryFn: () => getQueryDetail(queryId!),
    enabled: !!queryId,
    staleTime: 5 * 60_000,
  })
}
