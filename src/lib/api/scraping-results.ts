import { apiClient } from './client'

// ============================================
// Types
// ============================================

export interface ScrapingResultListItem {
  id: string
  session_id: string
  url: string
  operation: string
  content_size_bytes: number
  created_at: string
  updated_at: string | null
}

export interface ScrapingResultDetail extends ScrapingResultListItem {
  content: {
    markdown?: string
    links?: string[]
    metadata?: Record<string, unknown>
    truncated?: boolean
  }
}

export interface ScrapingResultsListResponse {
  results: ScrapingResultListItem[]
  next_cursor: string | null
  total_count: number
}

export interface ScrapingResultsFilters {
  cursor?: string
  limit?: number
  sessionId?: string
  operation?: string
}

// ============================================
// API Functions
// ============================================

export async function getScrapingResults(
  workspaceId: string,
  filters: ScrapingResultsFilters = {}
): Promise<ScrapingResultsListResponse> {
  const params = new URLSearchParams({ workspaceId })

  if (filters.cursor) params.set('cursor', filters.cursor)
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.sessionId) params.set('sessionId', filters.sessionId)
  if (filters.operation) params.set('operation', filters.operation)

  return apiClient.get<ScrapingResultsListResponse>(
    `/api/agent/data/scraping-results?${params.toString()}`
  )
}

export async function getScrapingResultDetail(
  workspaceId: string,
  id: string
): Promise<ScrapingResultDetail> {
  // workspaceId is not needed in the URL (RLS handles isolation),
  // but we keep it in the function signature for consistency with other API clients.
  void workspaceId
  return apiClient.get<ScrapingResultDetail>(
    `/api/agent/data/scraping-results/${encodeURIComponent(id)}`
  )
}
