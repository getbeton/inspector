import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpLogEntry {
  id: string
  tool_name: string
  status: string
  status_code: number | null
  duration_ms: number | null
  request_params: Record<string, unknown> | null
  error_message: string | null
  session_id: string | null
  created_at: string
}

export interface McpLogsPage {
  data: McpLogEntry[]
  nextCursor: string | null
}

export interface McpLogsFilters {
  tool_name?: string
  status?: 'success' | 'error'
  session_id?: string
  limit?: number
  cursor?: string
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export async function fetchMcpLogs(filters: McpLogsFilters): Promise<McpLogsPage> {
  const params = new URLSearchParams()
  if (filters.tool_name) params.set('tool_name', filters.tool_name)
  if (filters.status) params.set('status', filters.status)
  if (filters.session_id) params.set('session_id', filters.session_id)
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.cursor) params.set('cursor', filters.cursor)

  const qs = params.toString()
  return apiClient.get<McpLogsPage>(`/api/mcp/logs${qs ? `?${qs}` : ''}`)
}
