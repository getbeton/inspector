/**
 * Apollo.io API client for contact enrichment and company domain search
 */

import { ApolloContact, ApolloOrganization, createIntegrationError } from '../types'

const APOLLO_API_BASE = 'https://api.apollo.io/v1'

export interface ApolloClientConfig {
  apiKey: string
}

export interface ApolloSearchResult {
  people: ApolloContact[]
  pagination: {
    page: number
    per_page: number
    total_entries: number
    total_pages: number
  }
}

export class ApolloClient {
  private apiKey: string

  constructor(config: ApolloClientConfig) {
    if (!config.apiKey) {
      throw createIntegrationError('Apollo API key is required', 'INVALID_CONFIG')
    }

    this.apiKey = config.apiKey
  }

  /**
   * Search for people at a company domain
   */
  async findPeopleByDomain(
    domain: string,
    options: {
      titleKeywords?: string[]
      page?: number
      perPage?: number
    } = {}
  ): Promise<ApolloSearchResult> {
    const { titleKeywords, page = 1, perPage = 10 } = options

    const payload: Record<string, unknown> = {
      api_key: this.apiKey,
      q_organization_domains: domain,
      page,
      per_page: perPage,
    }

    if (titleKeywords && titleKeywords.length > 0) {
      payload.person_titles = titleKeywords
    }

    const response = await fetch(`${APOLLO_API_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const isRetryable = response.status === 429 || response.status >= 500
      throw createIntegrationError(
        `Apollo API error: ${response.statusText}`,
        'API_ERROR',
        response.status,
        isRetryable
      )
    }

    const data = await response.json()

    return {
      people: data.people || [],
      pagination: data.pagination || { page, per_page: perPage, total_entries: 0, total_pages: 0 },
    }
  }

  /**
   * Enrich a contact with additional data by email
   */
  async enrichContact(email: string): Promise<ApolloContact | null> {
    const payload = {
      api_key: this.apiKey,
      email,
    }

    const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }

      const isRetryable = response.status === 429 || response.status >= 500
      throw createIntegrationError(
        `Apollo API error: ${response.statusText}`,
        'API_ERROR',
        response.status,
        isRetryable
      )
    }

    const data = await response.json()
    return data.person || null
  }

  /**
   * Get organization/company data by domain
   */
  async getOrganization(domain: string): Promise<ApolloOrganization | null> {
    const payload = {
      api_key: this.apiKey,
      domain,
    }

    const response = await fetch(`${APOLLO_API_BASE}/organizations/enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }

      const isRetryable = response.status === 429 || response.status >= 500
      throw createIntegrationError(
        `Apollo API error: ${response.statusText}`,
        'API_ERROR',
        response.status,
        isRetryable
      )
    }

    const data = await response.json()
    return data.organization || null
  }

  /**
   * Test the Apollo API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const payload = {
        api_key: this.apiKey,
        q_organization_domains: 'example.com',
        page: 1,
        per_page: 1,
      }

      const response = await fetch(`${APOLLO_API_BASE}/mixed_people/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(payload),
      })

      return response.ok
    } catch {
      return false
    }
  }
}

/**
 * Factory function to create an Apollo client
 */
export function createApolloClient(apiKey: string): ApolloClient {
  return new ApolloClient({ apiKey })
}
