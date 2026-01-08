/**
 * PostHog API client for fetching events, persons, and activity data
 */

import { PostHogEvent, PostHogPerson, PostHogGroup, createIntegrationError } from '../types'

const POSTHOG_API_BASE = 'https://app.posthog.com/api'

export interface PostHogClientConfig {
  apiKey: string
  projectId: string
  host?: string
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
   * Execute a HogQL query
   */
  async query(hogql: string): Promise<{ results: unknown[][]; columns: string[] }> {
    return this.fetch('/query', {
      method: 'POST',
      body: JSON.stringify({
        query: {
          kind: 'HogQLQuery',
          query: hogql,
        },
      }),
    })
  }

  /**
   * Test the PostHog API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      // Simple request to verify credentials
      await this.fetch<unknown>('/persons?limit=1')
      return true
    } catch {
      return false
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
