/**
 * PostHog API client for fetching events, persons, and activity data
 * Extended with query execution, saved queries, and dashboard reads
 */

import { PostHogEvent, PostHogPerson, PostHogGroup, createIntegrationError } from '../types'
import { TimeoutError, PostHogAPIError } from '../../errors/query-errors'

const POSTHOG_API_BASE = 'https://app.posthog.com/api'

/** Default query timeout in milliseconds (60 seconds) */
const DEFAULT_QUERY_TIMEOUT_MS = 60_000

export interface PostHogClientConfig {
  apiKey: string
  projectId: string
  host?: string
}

export interface QueryOptions {
  /** Timeout in milliseconds (default: 60000) */
  timeoutMs?: number
}

export interface QueryResult {
  results: unknown[][]
  columns: string[]
}

// ============================================
// DatabaseSchemaQuery types
// ============================================

export interface DatabaseSchemaField {
  name: string
  /** e.g. 'integer', 'float', 'string', 'datetime', 'boolean', 'array', 'json', 'lazy_table', 'virtual_table', 'field_traverser' */
  type: string
  schema_valid: boolean
}

export interface DatabaseSchemaTable {
  id: string
  name: string
  /** e.g. 'posthog', 'data_warehouse', 'view', 'lazy_table', 'virtual_table' */
  type: string
  fields: Record<string, DatabaseSchemaField>
}

export interface DatabaseSchemaResponse {
  tables: Record<string, DatabaseSchemaTable>
}

export interface PostHogSavedQueryResponse {
  id: number | string
  name: string
  description?: string
  query: {
    kind: string
    query: string
  }
  created_at: string
  updated_at: string
}

export interface PostHogDashboardResponse {
  id: number | string
  name: string
  description?: string
  filters?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export class PostHogClient {
  private apiKey: string
  private projectId: string
  private baseUrl: string

  constructor(config: PostHogClientConfig) {
    if (!config.apiKey || !config.projectId) {
      throw createIntegrationError(
        'PostHog API key and project ID are required',
        'INVALID_CONFIG'
      )
    }

    this.apiKey = config.apiKey
    this.projectId = config.projectId
    this.baseUrl = config.host || POSTHOG_API_BASE
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/projects/${this.projectId}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const isRetryable = response.status === 429 || response.status >= 500
      throw createIntegrationError(
        `PostHog API error: ${response.statusText}`,
        'API_ERROR',
        response.status,
        isRetryable
      )
    }

    // Check content type to avoid JSON parse errors on HTML responses
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw createIntegrationError(
        'Invalid response from PostHog. Please verify your region and project ID.',
        'API_ERROR',
        response.status,
        false
      )
    }

    return response.json()
  }

  /**
   * Fetch events from PostHog within a date range
   */
  async getEvents(options: {
    startDate?: Date
    endDate?: Date
    eventType?: string
    limit?: number
  } = {}): Promise<PostHogEvent[]> {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      eventType,
      limit = 100,
    } = options

    const params = new URLSearchParams({
      after: startDate.toISOString(),
      before: endDate.toISOString(),
      limit: String(limit),
    })

    if (eventType) {
      params.append('event', eventType)
    }

    const response = await this.fetch<{ results: PostHogEvent[] }>(
      `/events?${params.toString()}`
    )

    return response.results
  }

  /**
   * Get properties for a specific person by distinct_id
   */
  async getPerson(distinctId: string): Promise<PostHogPerson | null> {
    try {
      const response = await this.fetch<{ results: PostHogPerson[] }>(
        `/persons?distinct_id=${encodeURIComponent(distinctId)}`
      )
      return response.results[0] || null
    } catch {
      return null
    }
  }

  /**
   * Get all persons with pagination
   */
  async getPersons(options: {
    limit?: number
    cursor?: string
  } = {}): Promise<{ results: PostHogPerson[]; next?: string }> {
    const { limit = 100, cursor } = options

    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) {
      params.append('cursor', cursor)
    }

    return this.fetch<{ results: PostHogPerson[]; next?: string }>(
      `/persons?${params.toString()}`
    )
  }

  /**
   * Get groups (organizations/companies) from PostHog
   */
  async getGroups(
    groupType: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<{ results: PostHogGroup[]; next?: string }> {
    const { limit = 100, cursor } = options

    const params = new URLSearchParams({
      group_type: groupType,
      limit: String(limit),
    })
    if (cursor) {
      params.append('cursor', cursor)
    }

    return this.fetch<{ results: PostHogGroup[]; next?: string }>(
      `/groups?${params.toString()}`
    )
  }

  /**
   * Get a specific group by key
   */
  async getGroup(groupType: string, groupKey: string): Promise<PostHogGroup | null> {
    try {
      return await this.fetch<PostHogGroup>(
        `/groups/find?group_type=${encodeURIComponent(groupType)}&group_key=${encodeURIComponent(groupKey)}`
      )
    } catch {
      return null
    }
  }

  /**
   * Execute a HogQL query with timeout support
   * @throws TimeoutError if query exceeds timeout
   * @throws PostHogAPIError if API request fails
   */
  async query(hogql: string, options?: QueryOptions): Promise<QueryResult> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS
    const controller = new AbortController()

    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, timeoutMs)

    try {
      const response = await this.fetchWithTimeout('/query', {
        method: 'POST',
        body: JSON.stringify({
          query: {
            kind: 'HogQLQuery',
            query: hogql,
          },
        }),
        signal: controller.signal,
      })

      return response as QueryResult
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(timeoutMs)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Fetch the full database schema via PostHog's DatabaseSchemaQuery.
   * Returns all tables and their fields visible in the project's HogQL virtual schema.
   */
  async getDatabaseSchema(): Promise<DatabaseSchemaResponse> {
    return this.fetchWithTimeout<DatabaseSchemaResponse>('/query', {
      method: 'POST',
      body: JSON.stringify({
        query: { kind: 'DatabaseSchemaQuery' },
      }),
    })
  }

  /**
   * Internal fetch with abort signal support
   */
  private async fetchWithTimeout<T>(
    endpoint: string,
    options: RequestInit & { signal?: AbortSignal } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/projects/${this.projectId}${endpoint}`

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        throw new PostHogAPIError({
          message: `PostHog API error: ${response.statusText}`,
          statusCode: response.status,
          posthogError: errorBody,
        })
      }

      return response.json()
    } catch (error) {
      if (error instanceof PostHogAPIError) {
        throw error
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw error // Re-throw to be handled by caller
      }
      throw new PostHogAPIError({
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: true,
      })
    }
  }

  // ============================================
  // Saved Queries (read-only)
  // ============================================

  /**
   * Get a saved query by ID
   */
  async getSavedQuery(queryId: string | number): Promise<PostHogSavedQueryResponse | null> {
    try {
      return await this.fetch<PostHogSavedQueryResponse>(`/saved_queries/${queryId}/`)
    } catch {
      return null
    }
  }

  /**
   * List all saved queries
   */
  async listSavedQueries(): Promise<{ results: PostHogSavedQueryResponse[] }> {
    return this.fetch('/saved_queries/')
  }

  // ============================================
  // Dashboards (read-only)
  // ============================================

  /**
   * Get a dashboard by ID
   */
  async getDashboard(dashboardId: string | number): Promise<PostHogDashboardResponse | null> {
    try {
      return await this.fetch<PostHogDashboardResponse>(`/dashboards/${dashboardId}/`)
    } catch {
      return null
    }
  }

  /**
   * List all dashboards
   */
  async listDashboards(): Promise<{ results: PostHogDashboardResponse[] }> {
    return this.fetch('/dashboards/')
  }

  /**
   * Test the PostHog API connection
   * Returns success/error details instead of swallowing errors
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Simple request to verify credentials
      await this.fetch<unknown>('/persons?limit=1')
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  }

  /**
   * Get event definitions to understand available events
   */
  async getEventDefinitions(): Promise<{ results: { name: string; volume_30_day: number }[] }> {
    return this.fetch('/event_definitions')
  }

  /**
   * Get property definitions
   */
  async getPropertyDefinitions(
    type: 'event' | 'person' | 'group' = 'person'
  ): Promise<{ results: { name: string; property_type: string }[] }> {
    return this.fetch(`/property_definitions?type=${type}`)
  }
}

/**
 * Factory function to create a PostHog client
 */
export function createPostHogClient(
  apiKey: string,
  projectId: string,
  host?: string
): PostHogClient {
  return new PostHogClient({ apiKey, projectId, host })
}
