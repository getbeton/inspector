/**
 * HubSpot Configuration Helpers (server-side only)
 *
 * Centralizes credential retrieval and validation for HubSpot connections.
 * Unlike other integrations that use integration_configs, HubSpot uses its own
 * hubspot_connections table to support multiple connections per workspace.
 *
 * SECURITY: Decrypted tokens must NEVER be sent to the frontend.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto/encryption'
import { createModuleLogger } from '@/lib/utils/logger'
import type { HubSpotAuthType } from './types'

const log = createModuleLogger('[HubSpot Config]')

// ============================================
// Constants
// ============================================

export const HUBSPOT_API_BASE = 'https://api.hubapi.com'

/** Default OAuth scopes requested during authorization */
export const DEFAULT_OAUTH_SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.companies.read',
  'crm.objects.deals.read',
  'crm.objects.owners.read',
  'crm.schemas.contacts.read',
  'crm.schemas.companies.read',
  'crm.schemas.deals.read',
]

/** Rate limit constants */
export const RATE_LIMITS = {
  /** OAuth apps: 110 requests per 10 seconds (we use 50% = 55) */
  OAUTH_TOKENS_PER_10S: 55,
  /** Private apps (free tier): 100 requests per 10 seconds (we use 50% = 50) */
  PRIVATE_APP_TOKENS_PER_10S: 50,
  /** Daily limit for OAuth: 250,000 (we use 80% = 200,000) */
  OAUTH_DAILY_LIMIT: 200_000,
  /** Max retry attempts for rate-limited requests */
  MAX_RETRIES: 3,
  /** Base delay for exponential backoff (ms) */
  BASE_RETRY_DELAY_MS: 1000,
} as const

/** Sync configuration */
export const SYNC_CONFIG = {
  /** Default page size for HubSpot list requests */
  PAGE_SIZE: 100,
  /** Maximum page size HubSpot allows */
  MAX_PAGE_SIZE: 100,
  /** Backfill window: how far back to sync on first connection (days) */
  BACKFILL_DAYS: 90,
  /** Sync lock timeout (minutes) — auto-unlock after this period */
  LOCK_TIMEOUT_MINUTES: 10,
  /** Maximum records per sync batch */
  MAX_RECORDS_PER_BATCH: 10_000,
} as const

// ============================================
// Credential Types
// ============================================

export interface HubSpotCredentials {
  authType: HubSpotAuthType
  /** OAuth access token or Private App token */
  token: string
  /** OAuth refresh token (only for OAuth connections) */
  refreshToken: string | null
  /** Token expiry time (only for OAuth connections) */
  tokenExpiresAt: string | null
  /** HubSpot portal/hub ID */
  hubId: string | null
  /** Connection row ID */
  connectionId: string
  /** Connection name */
  connectionName: string
  /** Whether the connection is active */
  isActive: boolean
  /** Connection status */
  status: string
}

// ============================================
// Credential Retrieval
// ============================================

/**
 * Shared implementation: fetch and decrypt HubSpot connection credentials.
 */
async function _getConnectionCredentials(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (...args: any[]) => any },
  connectionId: string
): Promise<HubSpotCredentials | null> {
  const { data, error } = await supabase
    .from('hubspot_connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (error || !data) {
    log.error('Failed to fetch HubSpot connection:', error)
    return null
  }

  try {
    let token: string
    let refreshToken: string | null = null

    if (data.auth_type === 'oauth') {
      if (!data.access_token_encrypted) {
        log.error('OAuth connection missing access token')
        return null
      }
      token = await decrypt(data.access_token_encrypted)
      if (data.refresh_token_encrypted) {
        refreshToken = await decrypt(data.refresh_token_encrypted)
      }
    } else {
      if (!data.private_app_token_encrypted) {
        log.error('Private App connection missing token')
        return null
      }
      token = await decrypt(data.private_app_token_encrypted)
    }

    return {
      authType: data.auth_type as HubSpotAuthType,
      token,
      refreshToken,
      tokenExpiresAt: data.token_expires_at,
      hubId: data.hub_id,
      connectionId: data.id,
      connectionName: data.name,
      isActive: data.is_active,
      status: data.status,
    }
  } catch (err) {
    log.error('Failed to decrypt HubSpot credentials:', err)
    return null
  }
}

/**
 * Retrieve and decrypt HubSpot connection credentials.
 * Uses the current user's session (RLS-protected).
 *
 * @param connectionId - The hubspot_connections row UUID
 * @returns Decrypted credentials or null if not found
 */
export async function getHubSpotConnectionCredentials(
  connectionId: string
): Promise<HubSpotCredentials | null> {
  const supabase = await createClient()
  return _getConnectionCredentials(supabase, connectionId)
}

/**
 * Retrieve and decrypt HubSpot connection credentials using the admin client.
 * Bypasses RLS — use only in cron jobs, agent routes, etc.
 *
 * @param connectionId - The hubspot_connections row UUID
 * @returns Decrypted credentials or null if not found
 */
export async function getHubSpotConnectionCredentialsAdmin(
  connectionId: string
): Promise<HubSpotCredentials | null> {
  const supabase = createAdminClient()
  return _getConnectionCredentials(supabase, connectionId)
}

// ============================================
// Connection Resolution
// ============================================

/**
 * Resolve which HubSpot connection to use for a workspace.
 *
 * If connectionId is provided, returns that connection (after verifying workspace).
 * Otherwise, returns the primary active connection for the workspace.
 *
 * @param workspaceId - The workspace UUID
 * @param connectionId - Optional specific connection UUID
 * @returns Connection row or null
 */
export async function resolveHubSpotConnection(
  workspaceId: string,
  connectionId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any> | null> {
  const supabase = await createClient()
  return _resolveConnection(supabase, workspaceId, connectionId)
}

/**
 * Resolve which HubSpot connection to use — admin variant.
 * Bypasses RLS. Use in agent routes, cron jobs, etc.
 */
export async function resolveHubSpotConnectionAdmin(
  workspaceId: string,
  connectionId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any> | null> {
  const supabase = createAdminClient()
  return _resolveConnection(supabase, workspaceId, connectionId)
}

/**
 * Shared implementation for connection resolution.
 */
async function _resolveConnection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (...args: any[]) => any },
  workspaceId: string,
  connectionId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any> | null> {
  if (connectionId) {
    const { data, error } = await supabase
      .from('hubspot_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('workspace_id', workspaceId)
      .single()

    if (error || !data) return null
    return data as Record<string, unknown>
  }

  // Find primary active connection
  const { data, error } = await supabase
    .from('hubspot_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (error || !data) return null
  return data as Record<string, unknown>
}
