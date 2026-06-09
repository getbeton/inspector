/**
 * HubSpot CRM API Client
 *
 * Provides a typed interface to the HubSpot CRM API with:
 * - OAuth and Private App Token authentication
 * - Automatic token refresh for OAuth connections
 * - Rate limiting via token bucket (rate-limiter.ts)
 * - Retry logic with exponential backoff for 429 responses
 * - Methods for all standard CRM objects (contacts, companies, deals, tickets)
 *
 * HubSpot API base: https://api.hubapi.com
 */

import {
  HubSpotError,
  HubSpotAuthError,
  HubSpotRateLimitError,
  HubSpotNotFoundError,
  HubSpotValidationError,
  type HubSpotRecord,
  type HubSpotListResponse,
  type HubSpotSearchOptions,
  type HubSpotSearchResponse,
  type HubSpotAccountInfo,
  type HubSpotOwner,
  type HubSpotPropertyDefinition,
  type HubSpotObjectSchema,
  type HubSpotBatchAssociationResponse,
  type HubSpotAuthType,
  type RateLimitPriority,
} from './types'
import { HUBSPOT_API_BASE, RATE_LIMITS } from './config'
import {
  acquire,
  handleRateLimitResponse,
  parseRateLimitHeaders,
  updateFromHeaders,
} from './rate-limiter'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot Client]')

// ============================================
// Client Configuration
// ============================================

export interface HubSpotClientConfig {
  /** OAuth access token or Private App token */
  token: string
  /** Auth type determines rate limit capacity */
  authType: HubSpotAuthType
  /** Connection ID for rate limiting */
  connectionId: string
  /** OAuth refresh token (only for OAuth connections) */
  refreshToken?: string
  /** Callback to refresh OAuth tokens */
  onTokenRefresh?: (newToken: string, newRefreshToken: string, expiresAt: string) => Promise<void>
  /** Token expiry timestamp (ISO 8601) */
  tokenExpiresAt?: string | null
}

// ============================================
// HubSpot Client Class
// ============================================

export class HubSpotClient {
  private token: string
  private authType: HubSpotAuthType
  private connectionId: string
  private refreshToken?: string
  private onTokenRefresh?: HubSpotClientConfig['onTokenRefresh']
  private tokenExpiresAt?: string | null

  constructor(config: HubSpotClientConfig) {
    if (!config.token) {
      throw new HubSpotError('HubSpot token is required')
    }

    this.token = config.token
    this.authType = config.authType
    this.connectionId = config.connectionId
    this.refreshToken = config.refreshToken
    this.onTokenRefresh = config.onTokenRefresh
    this.tokenExpiresAt = config.tokenExpiresAt
  }

  // ============================================
  // Core HTTP Methods
  // ============================================

  /**
   * Make an authenticated request to the HubSpot API with rate limiting and retries.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    priority: RateLimitPriority = 'normal'
  ): Promise<T> {
    // Auto-refresh OAuth tokens if needed
    await this.ensureValidToken()

    // Acquire rate limit token
    await acquire(this.connectionId, priority, this.authType)

    const url = `${HUBSPOT_API_BASE}${endpoint}`

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= RATE_LIMITS.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...options.headers,
          },
        })

        // Update rate limit state from response headers
        const rateLimitHeaders = parseRateLimitHeaders(response)
        updateFromHeaders(this.connectionId, rateLimitHeaders)

        if (response.ok) {
          // Some endpoints return 204 with no body
          if (response.status === 204) {
            return undefined as T
          }
          return response.json()
        }

        // Handle specific error codes
        const errorBody = await response.text().catch(() => '')
        let parsedError: { message?: string; category?: string } = {}
        try {
          parsedError = JSON.parse(errorBody)
        } catch {
          // Ignore parse errors
        }

        const errorMessage = parsedError.message || response.statusText

        switch (response.status) {
          case 401:
            throw new HubSpotAuthError(`Authentication failed: ${errorMessage}`)
          case 403:
            throw new HubSpotAuthError(`Access forbidden: ${errorMessage}`)
          case 404:
            throw new HubSpotNotFoundError(`Resource not found: ${errorMessage}`)
          case 422:
            throw new HubSpotValidationError(`Validation failed: ${errorMessage}`)
          case 429: {
            const retryAfter = parseInt(
              response.headers.get('retry-after') || '10',
              10
            )
            handleRateLimitResponse(this.connectionId, retryAfter)

            if (attempt < RATE_LIMITS.MAX_RETRIES) {
              const delay =
                RATE_LIMITS.BASE_RETRY_DELAY_MS * Math.pow(2, attempt) +
                Math.random() * 1000
              log.warn(
                `Rate limited (attempt ${attempt + 1}/${RATE_LIMITS.MAX_RETRIES}), ` +
                `retrying in ${Math.round(delay)}ms`
              )
              await new Promise((resolve) => setTimeout(resolve, delay))
              continue
            }

            throw new HubSpotRateLimitError(
              `Rate limit exceeded after ${RATE_LIMITS.MAX_RETRIES} retries`,
              retryAfter
            )
          }
          default:
            if (response.status >= 500 && attempt < RATE_LIMITS.MAX_RETRIES) {
              const delay =
                RATE_LIMITS.BASE_RETRY_DELAY_MS * Math.pow(2, attempt) +
                Math.random() * 1000
              log.warn(
                `Server error ${response.status} (attempt ${attempt + 1}), retrying in ${Math.round(delay)}ms`
              )
              await new Promise((resolve) => setTimeout(resolve, delay))
              continue
            }
            throw new HubSpotError(`API error (${response.status}): ${errorMessage}`)
        }
      } catch (error) {
        if (
          error instanceof HubSpotAuthError ||
          error instanceof HubSpotNotFoundError ||
          error instanceof HubSpotValidationError
        ) {
          throw error
        }

        if (error instanceof HubSpotRateLimitError) {
          throw error
        }

        if (error instanceof HubSpotError) {
          throw error
        }

        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < RATE_LIMITS.MAX_RETRIES) {
          const delay = RATE_LIMITS.BASE_RETRY_DELAY_MS * Math.pow(2, attempt)
          log.warn(`Network error (attempt ${attempt + 1}), retrying in ${delay}ms`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
      }
    }

    throw lastError || new HubSpotError('Request failed after all retries')
  }

  /**
   * Ensure the OAuth token is still valid, refreshing if needed.
   */
  private async ensureValidToken(): Promise<void> {
    if (this.authType !== 'oauth' || !this.tokenExpiresAt || !this.refreshToken) {
      return
    }

    const { isTokenExpired } = await import('./auth')

    if (!isTokenExpired(this.tokenExpiresAt)) {
      return
    }

    log.info(`Refreshing expired OAuth token for connection ${this.connectionId}`)

    const clientId = process.env.HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new HubSpotAuthError('Cannot refresh token: HUBSPOT_CLIENT_ID/SECRET not configured')
    }

    const { refreshAccessToken } = await import('./auth')
    const tokens = await refreshAccessToken(this.refreshToken, clientId, clientSecret)

    this.token = tokens.access_token
    this.refreshToken = tokens.refresh_token
    this.tokenExpiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString()

    // Notify caller to persist new tokens
    if (this.onTokenRefresh) {
      await this.onTokenRefresh(
        tokens.access_token,
        tokens.refresh_token,
        this.tokenExpiresAt
      )
    }
  }

  // ============================================
  // Connection & Account
  // ============================================

  /**
   * Test the HubSpot API connection.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getAccountInfo()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Get HubSpot account information.
   */
  async getAccountInfo(): Promise<HubSpotAccountInfo> {
    return this.request<HubSpotAccountInfo>(
      '/account-info/v3/details',
      {},
      'high'
    )
  }

  // ============================================
  // CRM Objects — List
  // ============================================

  /**
   * Get contacts with optional property selection and pagination.
   */
  async getContacts(options: {
    properties?: string[]
    limit?: number
    after?: string
  } = {}): Promise<HubSpotListResponse> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.after) params.set('after', options.after)
    if (options.properties?.length) {
      params.set('properties', options.properties.join(','))
    }

    return this.request<HubSpotListResponse>(
      `/crm/v3/objects/contacts?${params.toString()}`
    )
  }

  /**
   * Get companies with optional property selection and pagination.
   */
  async getCompanies(options: {
    properties?: string[]
    limit?: number
    after?: string
  } = {}): Promise<HubSpotListResponse> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.after) params.set('after', options.after)
    if (options.properties?.length) {
      params.set('properties', options.properties.join(','))
    }

    return this.request<HubSpotListResponse>(
      `/crm/v3/objects/companies?${params.toString()}`
    )
  }

  /**
   * Get deals with optional property selection and pagination.
   */
  async getDeals(options: {
    properties?: string[]
    limit?: number
    after?: string
  } = {}): Promise<HubSpotListResponse> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.after) params.set('after', options.after)
    if (options.properties?.length) {
      params.set('properties', options.properties.join(','))
    }

    return this.request<HubSpotListResponse>(
      `/crm/v3/objects/deals?${params.toString()}`
    )
  }

  /**
   * Get tickets with optional property selection and pagination.
   */
  async getTickets(options: {
    properties?: string[]
    limit?: number
    after?: string
  } = {}): Promise<HubSpotListResponse> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.after) params.set('after', options.after)
    if (options.properties?.length) {
      params.set('properties', options.properties.join(','))
    }

    return this.request<HubSpotListResponse>(
      `/crm/v3/objects/tickets?${params.toString()}`
    )
  }

  /**
   * Get custom objects by object type ID.
   */
  async getCustomObjects(
    objectTypeId: string,
    options: {
      properties?: string[]
      limit?: number
      after?: string
    } = {}
  ): Promise<HubSpotListResponse> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.after) params.set('after', options.after)
    if (options.properties?.length) {
      params.set('properties', options.properties.join(','))
    }

    return this.request<HubSpotListResponse>(
      `/crm/v3/objects/${objectTypeId}?${params.toString()}`
    )
  }

  /**
   * Get engagements (calls, emails, meetings, notes, tasks).
   */
  async getEngagements(
    engagementType: string,
    options: {
      properties?: string[]
      limit?: number
      after?: string
    } = {}
  ): Promise<HubSpotListResponse> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.after) params.set('after', options.after)
    if (options.properties?.length) {
      params.set('properties', options.properties.join(','))
    }

    return this.request<HubSpotListResponse>(
      `/crm/v3/objects/${engagementType}?${params.toString()}`
    )
  }

  // ============================================
  // CRM Objects — Single Record
  // ============================================

  /**
   * Get a single CRM record by ID.
   */
  async getRecord(
    objectType: string,
    recordId: string,
    properties?: string[]
  ): Promise<HubSpotRecord> {
    const params = new URLSearchParams()
    if (properties?.length) {
      params.set('properties', properties.join(','))
    }

    return this.request<HubSpotRecord>(
      `/crm/v3/objects/${objectType}/${recordId}?${params.toString()}`,
      {},
      'high'
    )
  }

  /**
   * Batch read records by IDs.
   */
  async batchRead(
    objectType: string,
    ids: string[],
    properties?: string[]
  ): Promise<{ results: HubSpotRecord[] }> {
    return this.request<{ results: HubSpotRecord[] }>(
      `/crm/v3/objects/${objectType}/batch/read`,
      {
        method: 'POST',
        body: JSON.stringify({
          inputs: ids.map((id) => ({ id })),
          properties: properties || [],
        }),
      }
    )
  }

  // ============================================
  // Search
  // ============================================

  /**
   * Search CRM objects with filters, sorts, and full-text query.
   */
  async search(
    objectType: string,
    searchOptions: HubSpotSearchOptions
  ): Promise<HubSpotSearchResponse> {
    return this.request<HubSpotSearchResponse>(
      `/crm/v3/objects/${objectType}/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: searchOptions.filterGroups || [],
          sorts: searchOptions.sorts || [],
          query: searchOptions.query || '',
          properties: searchOptions.properties || [],
          limit: searchOptions.limit || 10,
          after: searchOptions.after || '0',
        }),
      },
      'high'
    )
  }

  // ============================================
  // Associations
  // ============================================

  /**
   * Get associations between objects.
   */
  async getAssociations(
    fromObjectType: string,
    fromObjectId: string,
    toObjectType: string
  ): Promise<HubSpotBatchAssociationResponse> {
    return this.request<HubSpotBatchAssociationResponse>(
      `/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}`
    )
  }

  // ============================================
  // Schema & Properties
  // ============================================

  /**
   * Get all CRM object schemas.
   */
  async getObjectSchemas(): Promise<{ results: HubSpotObjectSchema[] }> {
    return this.request<{ results: HubSpotObjectSchema[] }>(
      '/crm/v3/schemas'
    )
  }

  /**
   * Get properties for an object type.
   */
  async getProperties(objectType: string): Promise<{ results: HubSpotPropertyDefinition[] }> {
    return this.request<{ results: HubSpotPropertyDefinition[] }>(
      `/crm/v3/properties/${objectType}`
    )
  }

  /**
   * Create a new property on an object type.
   */
  async createProperty(
    objectType: string,
    property: {
      name: string
      label: string
      type: string
      fieldType: string
      groupName: string
      description?: string
    }
  ): Promise<HubSpotPropertyDefinition> {
    return this.request<HubSpotPropertyDefinition>(
      `/crm/v3/properties/${objectType}`,
      {
        method: 'POST',
        body: JSON.stringify(property),
      },
      'high'
    )
  }

  /**
   * Create a property group on an object type.
   */
  async createPropertyGroup(
    objectType: string,
    group: { name: string; label: string; displayOrder?: number }
  ): Promise<{ name: string; label: string }> {
    return this.request<{ name: string; label: string }>(
      `/crm/v3/properties/${objectType}/groups`,
      {
        method: 'POST',
        body: JSON.stringify(group),
      },
      'high'
    )
  }

  // ============================================
  // CRM Objects — Create / Update
  // ============================================

  /**
   * Create a single CRM record.
   */
  async createRecord(
    objectType: string,
    properties: Record<string, string | number | boolean>
  ): Promise<HubSpotRecord> {
    return this.request<HubSpotRecord>(
      `/crm/v3/objects/${objectType}`,
      {
        method: 'POST',
        body: JSON.stringify({ properties }),
      },
      'high'
    )
  }

  /**
   * Update a single CRM record.
   */
  async updateRecord(
    objectType: string,
    recordId: string,
    properties: Record<string, string | number | boolean>
  ): Promise<HubSpotRecord> {
    return this.request<HubSpotRecord>(
      `/crm/v3/objects/${objectType}/${recordId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      },
      'high'
    )
  }

  // ============================================
  // Associations — Create
  // ============================================

  /**
   * Create an association between two CRM records (v4 API).
   */
  async createAssociationV4(
    fromObjectType: string,
    fromObjectId: string,
    toObjectType: string,
    toObjectId: string,
    associationTypeId: number
  ): Promise<void> {
    await this.request<unknown>(
      `/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}`,
      {
        method: 'PUT',
        body: JSON.stringify([
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId,
          },
        ]),
      },
      'high'
    )
  }

  /**
   * Batch create associations between CRM records (v4 API).
   */
  async batchCreateAssociationsV4(
    fromObjectType: string,
    toObjectType: string,
    inputs: Array<{
      from: { id: string }
      to: { id: string }
      types: Array<{ associationCategory: string; associationTypeId: number }>
    }>
  ): Promise<void> {
    await this.request<unknown>(
      `/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/create`,
      {
        method: 'POST',
        body: JSON.stringify({ inputs }),
      },
      'high'
    )
  }

  // ============================================
  // Lists
  // ============================================

  /**
   * Create a static contact list.
   */
  async createStaticList(
    name: string
  ): Promise<{ listId: string; name: string }> {
    const result = await this.request<{
      listId?: string
      list_id?: string
      id?: string
      name?: string
    }>(
      '/crm/v3/lists',
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          objectTypeId: '0-1', // contacts
          processingType: 'MANUAL',
        }),
      },
      'high'
    )

    return {
      listId: String(result.listId || result.list_id || result.id || ''),
      name: result.name || name,
    }
  }

  /**
   * Add contacts to a static list by contact IDs.
   */
  async addContactsToList(
    listId: string,
    contactIds: string[]
  ): Promise<void> {
    await this.request<unknown>(
      `/crm/v3/lists/${listId}/memberships/add`,
      {
        method: 'PUT',
        body: JSON.stringify(contactIds),
      },
      'high'
    )
  }

  // ============================================
  // Owners
  // ============================================

  /**
   * Get all owners in the HubSpot account.
   */
  async getOwners(): Promise<{ results: HubSpotOwner[] }> {
    return this.request<{ results: HubSpotOwner[] }>(
      '/crm/v3/owners'
    )
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a HubSpot client from configuration.
 */
export function createHubSpotClient(config: HubSpotClientConfig): HubSpotClient {
  return new HubSpotClient(config)
}

/**
 * Create a HubSpot client for a workspace from its `integration_configs` row.
 * Uses the admin client to bypass RLS (for agent / background routes).
 */
export async function createHubSpotClientForWorkspace(
  workspaceId: string
): Promise<HubSpotClient> {
  const { getHubSpotCredentialsAdmin, HUBSPOT_INTEGRATION_NAME } = await import('./config')
  const { encrypt } = await import('@/lib/crypto/encryption')

  const credentials = await getHubSpotCredentialsAdmin(workspaceId)
  if (!credentials) {
    throw new HubSpotError(
      `HubSpot is not connected for workspace ${workspaceId} (or decryption failed)`
    )
  }

  if (!credentials.isActive) {
    throw new HubSpotError(`HubSpot integration is not active for workspace ${workspaceId}`)
  }

  return new HubSpotClient({
    token: credentials.token,
    authType: credentials.authType,
    connectionId: workspaceId, // rate-limit bucket key (one HubSpot connection per workspace)
    refreshToken: credentials.refreshToken || undefined,
    tokenExpiresAt: credentials.tokenExpiresAt,
    onTokenRefresh: async (newToken, newRefreshToken, expiresAt) => {
      // Persist refreshed OAuth tokens back to integration_configs: new access
      // token → api_key_encrypted; refresh token + expiry merged into config_json.
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminClient()

      const [accessEncrypted, refreshEncrypted] = await Promise.all([
        encrypt(newToken),
        encrypt(newRefreshToken),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from('integration_configs')
        .select('config_json')
        .eq('workspace_id', workspaceId)
        .eq('integration_name', HUBSPOT_INTEGRATION_NAME)
        .single()

      const mergedConfig = {
        ...(existing?.config_json ?? {}),
        refresh_token_encrypted: refreshEncrypted,
        token_expires_at: expiresAt,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('integration_configs')
        .update({ api_key_encrypted: accessEncrypted, config_json: mergedConfig })
        .eq('workspace_id', workspaceId)
        .eq('integration_name', HUBSPOT_INTEGRATION_NAME)
    },
  })
}
