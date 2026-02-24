/**
 * PostHog Query Execution Types
 * Domain models for query tracking, results caching, saved queries, and dashboards
 */

// ============================================
// Enums
// ============================================

export type PosthogQueryStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout'

// ============================================
// Database Row Types (match migration schema)
// ============================================

/**
 * PostHog query execution record
 * Tracks each HogQL query request
 */
export interface PosthogQuery {
  id: string
  workspace_id: string
  session_id?: string | null
  query_text: string
  query_hash: string
  status: PosthogQueryStatus
  execution_time_ms: number | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface PosthogQueryInsert {
  id?: string
  workspace_id: string
  session_id?: string | null
  query_text: string
  query_hash: string
  status?: PosthogQueryStatus
  execution_time_ms?: number | null
  error_message?: string | null
  created_at?: string
  started_at?: string | null
  completed_at?: string | null
}

export interface PosthogQueryUpdate {
  status?: PosthogQueryStatus
  execution_time_ms?: number | null
  error_message?: string | null
  started_at?: string | null
  completed_at?: string | null
}

/**
 * Cached query result
 * Stores results for deduplication and fast retrieval
 */
export interface PosthogQueryResult {
  id: string
  workspace_id: string
  session_id?: string | null
  query_id: string
  query_hash: string
  columns: string[]
  results: unknown[][]
  row_count: number
  cached_at: string
  expires_at: string | null
  created_at: string
}

export interface PosthogQueryResultInsert {
  id?: string
  workspace_id: string
  session_id?: string | null
  query_id: string
  query_hash: string
  columns: string[]
  results: unknown[][]
  row_count: number
  cached_at?: string
  expires_at?: string | null
  created_at?: string
}

/**
 * Saved query definition
 * References queries stored in PostHog
 */
export interface PosthogSavedQuery {
  id: string
  workspace_id: string
  posthog_query_id: string | null
  name: string
  description: string | null
  query_text: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PosthogSavedQueryInsert {
  id?: string
  workspace_id: string
  posthog_query_id?: string | null
  name: string
  description?: string | null
  query_text: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface PosthogSavedQueryUpdate {
  posthog_query_id?: string | null
  name?: string
  description?: string | null
  query_text?: string
  is_active?: boolean
  updated_at?: string
}

/**
 * Dashboard configuration
 * References dashboards stored in PostHog
 */
export interface PosthogDashboard {
  id: string
  workspace_id: string
  posthog_dashboard_id: string | null
  name: string
  description: string | null
  config: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PosthogDashboardInsert {
  id?: string
  workspace_id: string
  posthog_dashboard_id?: string | null
  name: string
  description?: string | null
  config?: Record<string, unknown>
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface PosthogDashboardUpdate {
  posthog_dashboard_id?: string | null
  name?: string
  description?: string | null
  config?: Record<string, unknown>
  is_active?: boolean
  updated_at?: string
}

// ============================================
// API Response Types
// ============================================

/**
 * Query execution API response
 * Returned from POST /api/posthog/query/execute
 */
export interface QueryExecutionResult {
  query_id: string
  status: PosthogQueryStatus
  execution_time_ms: number
  row_count: number
  columns: string[]
  results: unknown[][]
  cached: boolean
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  remaining: number
  limit: number
  reset_at: string
  is_limited: boolean
}

/**
 * API error response format
 */
export interface QueryErrorResponse {
  error: string
  error_code: string
  details?: Record<string, unknown>
  retryable: boolean
}

// ============================================
// Request Types
// ============================================

/**
 * Query execution request
 */
export interface QueryExecutionRequest {
  query: string
}

/**
 * Create saved query request
 */
export interface CreateSavedQueryRequest {
  name: string
  description?: string
  query_text: string
}

/**
 * Update saved query request
 */
export interface UpdateSavedQueryRequest {
  name?: string
  description?: string
  query_text?: string
  is_active?: boolean
}

/**
 * Create dashboard request
 */
export interface CreateDashboardRequest {
  name: string
  description?: string
  config?: Record<string, unknown>
}

/**
 * Update dashboard request
 */
export interface UpdateDashboardRequest {
  name?: string
  description?: string
  config?: Record<string, unknown>
  is_active?: boolean
}
