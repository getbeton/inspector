import { apiClient } from './client'

// ============================================
// Types
// ============================================

export interface QueryHistoryItem {
  id: string
  workspace_id: string
  session_id: string | null
  query_text: string
  query_hash: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout'
  execution_time_ms: number | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface QueryHistoryListResponse {
  queries: QueryHistoryItem[]
  next_cursor: string | null
  total_count: number
}

export interface QueryDetailResult {
  columns: string[]
  results: unknown[][]
  row_count: number
  cached_at: string
  expires_at: string
}

export interface QueryDetailResponse {
  query: QueryHistoryItem
  result: QueryDetailResult | null
}

export interface QueryHistoryFilters {
  cursor?: string
  limit?: number
  sessionId?: string
  status?: string
}

// ============================================
// API Functions
// ============================================

export async function getQueryHistory(
  workspaceId: string,
  filters: QueryHistoryFilters = {}
): Promise<QueryHistoryListResponse> {
  const params = new URLSearchParams({ workspaceId })

  if (filters.cursor) params.set('cursor', filters.cursor)
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.sessionId) params.set('sessionId', filters.sessionId)
  if (filters.status) params.set('status', filters.status)

  return apiClient.get<QueryHistoryListResponse>(
    `/api/agent/data/queries?${params.toString()}`
  )
}

export async function getQueryDetail(
  id: string
): Promise<QueryDetailResponse> {
  return apiClient.get<QueryDetailResponse>(
    `/api/agent/data/queries/${encodeURIComponent(id)}`
  )
}
