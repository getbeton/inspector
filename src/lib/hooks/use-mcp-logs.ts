'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchMcpLogs, type McpLogsFilters, type McpLogsPage } from '@/lib/api/mcp-logs'

export const mcpLogKeys = {
  all: ['mcp', 'logs'] as const,
  list: (filters: Omit<McpLogsFilters, 'cursor'>) =>
    [...mcpLogKeys.all, 'list', filters] as const,
}

/**
 * Infinite-scroll hook for MCP request logs with cursor-based pagination.
 * Auto-refreshes every 15s while the component is mounted (Logs tab active).
 */
export function useMcpLogs(filters: Omit<McpLogsFilters, 'cursor'>) {
  return useInfiniteQuery<McpLogsPage>({
    queryKey: mcpLogKeys.list(filters),
    queryFn: ({ pageParam }) =>
      fetchMcpLogs({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  })
}
