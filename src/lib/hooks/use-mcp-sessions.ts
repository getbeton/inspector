'use client'

import { useQuery } from '@tanstack/react-query'
import { getMcpSessions } from '@/lib/api/mcp-sessions'
import { useSetupStatus } from './use-setup-status'

export const mcpSessionKeys = {
  all: ['mcp', 'sessions'] as const,
  list: (workspaceId: string) => [...mcpSessionKeys.all, 'list', workspaceId] as const,
}

/**
 * Fetches MCP sessions for the current workspace.
 * Polls every 10s when any session is in a non-terminal state (created | running).
 */
export function useMcpSessions() {
  const { data: setupStatus } = useSetupStatus()
  const workspaceId = setupStatus?.workspaceId

  const query = useQuery({
    queryKey: mcpSessionKeys.list(workspaceId ?? ''),
    queryFn: () => getMcpSessions(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const hasActive = query.data?.some(
    (s) => s.status === 'running' || s.status === 'created',
  )

  // Re-run as a second hook with refetchInterval derived from first fetch
  return useQuery({
    queryKey: mcpSessionKeys.list(workspaceId ?? ''),
    queryFn: () => getMcpSessions(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: hasActive ? 10_000 : false,
  })
}
