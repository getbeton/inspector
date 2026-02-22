/**
 * PostHog API client — copied from src/lib/integrations/posthog/client.ts
 * Updated imports to use local copies.
 */

import { createIntegrationError } from './integration-types.js'
import { TimeoutError, PostHogAPIError } from './query-errors.js'

const POSTHOG_API_BASE = 'https://app.posthog.com/api'
const DEFAULT_QUERY_TIMEOUT_MS = 60_000

export interface PostHogClientConfig {
  apiKey: string
  projectId: string
  host?: string
}

export interface QueryOptions {
  timeoutMs?: number
}

export interface QueryResult {
  results: unknown[][]
  columns: string[]
}

export interface WarehouseTableColumn {
  key: string
  name: string
  type: string
  schema_valid: boolean
  fields?: Record<string, unknown>
  table?: string
  chain?: unknown[]
}

export interface WarehouseTable {
  id: string
  name: string
  format: string
  columns: WarehouseTableColumn[]
  external_data_source?: { id: string; source_type: string } | null
}

export interface WarehouseTablesPage {
  count: number
  next: string | null
  previous: string | null
  results: WarehouseTable[]
}

export interface DatabaseSchemaField {
  key: string
  type: string
  table?: string
  fields?: string[]
  chain?: string[]
  schema_valid?: boolean
}

export interface DatabaseSchemaTable {
  type: string
  id: string
  name: string
  fields: Record<string, DatabaseSchemaField>
}

export type DatabaseSchemaResponse = Record<string, DatabaseSchemaTable>

export class PostHogClient {
  private apiKey: string
  private projectId: string
  private baseUrl: string

  constructor(config: PostHogClientConfig) {
    if (!config.apiKey || !config.projectId) {
      throw createIntegrationError('PostHog API key and project ID are required', 'INVALID_CONFIG')
    }
    this.apiKey = config.apiKey
    this.projectId = config.projectId
    this.baseUrl = config.host || POSTHOG_API_BASE
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
      throw createIntegrationError(`PostHog API error: ${response.statusText}`, 'API_ERROR', response.status, isRetryable)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw createIntegrationError('Invalid response from PostHog. Please verify your region and project ID.', 'API_ERROR', response.status, false)
    }

    return response.json()
  }

  private async fetchRaw<T>(fullPath: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${fullPath}`
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
      throw createIntegrationError(`PostHog API error: ${response.statusText}`, 'API_ERROR', response.status, isRetryable)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw createIntegrationError('Invalid response from PostHog. Please verify your region and project ID.', 'API_ERROR', response.status, false)
    }

    return response.json()
  }

  private async fetchWithTimeout<T>(endpoint: string, options: RequestInit & { signal?: AbortSignal } = {}): Promise<T> {
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
        throw new PostHogAPIError({ message: `PostHog API error: ${response.statusText}`, statusCode: response.status, posthogError: errorBody })
      }

      return response.json()
    } catch (error) {
      if (error instanceof PostHogAPIError) throw error
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new PostHogAPIError({ message: error instanceof Error ? error.message : 'Unknown error', retryable: true })
    }
  }

  async query(hogql: string, options?: QueryOptions): Promise<QueryResult> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await this.fetchWithTimeout('/query', {
        method: 'POST',
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
        signal: controller.signal,
      })
      return response as QueryResult
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new TimeoutError(timeoutMs)
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async getWarehouseTables(): Promise<WarehouseTable[]> {
    const all: WarehouseTable[] = []
    let path: string | null = `/environments/${this.projectId}/warehouse_tables/`
    const MAX_PAGES = 20

    for (let i = 0; i < MAX_PAGES && path; i++) {
      const pageData: WarehouseTablesPage = await this.fetchRaw<WarehouseTablesPage>(path)
      all.push(...pageData.results)
      if (pageData.next) {
        try {
          const nextUrl = new URL(pageData.next)
          path = nextUrl.pathname.replace(/^\/api/, '') + nextUrl.search
        } catch {
          path = null
        }
      } else {
        path = null
      }
    }

    return all
  }

  async getDatabaseSchema(): Promise<DatabaseSchemaResponse> {
    const result = await this.fetch<{ tables: DatabaseSchemaResponse }>('/query/', {
      method: 'POST',
      body: JSON.stringify({ query: { kind: 'DatabaseSchemaQuery' } }),
    })
    return result.tables
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.fetch<unknown>('/persons?limit=1')
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  }
}

export function createPostHogClient(apiKey: string, projectId: string, host?: string): PostHogClient {
  return new PostHogClient({ apiKey, projectId, host })
}
