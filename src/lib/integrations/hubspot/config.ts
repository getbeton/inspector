/**
 * HubSpot Configuration Helpers (server-side only)
 *
 * HubSpot conforms to the standard `integration_configs` model — one connection
 * per workspace, like Attio / PostHog / Apollo. Token storage:
 *   - private-app token → `api_key_encrypted`
 *   - OAuth access token → `api_key_encrypted`, with refresh token + expiry +
 *     hub metadata + per-object sync cursor in `config_json`.
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

/** The `integration_configs.integration_name` value for HubSpot. */
export const HUBSPOT_INTEGRATION_NAME = 'hubspot'

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
  /** Maximum records per sync batch */
  MAX_RECORDS_PER_BATCH: 10_000,
} as const

// ============================================
// Types
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
  /** Owning workspace */
  workspaceId: string
  /** Whether the integration is active */
  isActive: boolean
  /** Connection status */
  status: string
}

/** Shape of the HubSpot-specific fields persisted in `integration_configs.config_json`. */
export interface HubSpotConfigJson {
  auth_type?: HubSpotAuthType
  refresh_token_encrypted?: string | null
  token_expires_at?: string | null
  hub_id?: string | null
  hub_domain?: string | null
  account_name?: string | null
  scopes?: string[]
  /** Per-object incremental watermark (replaces the dropped hubspot_sync_state table; F1 advances it). */
  sync_cursor?: Record<string, { cursor?: string | null; modified_since?: string | null }>
}

// ============================================
// Credential Retrieval
// ============================================

async function _getCredentials(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (...args: any[]) => any },
  workspaceId: string
): Promise<HubSpotCredentials | null> {
  const { data, error } = await supabase
    .from('integration_configs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('integration_name', HUBSPOT_INTEGRATION_NAME)
    .single()

  if (error || !data) {
    return null
  }

  try {
    const config = (data.config_json ?? {}) as HubSpotConfigJson
    const authType = (config.auth_type ?? 'private_app') as HubSpotAuthType

    if (!data.api_key_encrypted) {
      log.error('HubSpot config missing token')
      return null
    }

    const token = await decrypt(data.api_key_encrypted)
    let refreshToken: string | null = null
    if (authType === 'oauth' && config.refresh_token_encrypted) {
      refreshToken = await decrypt(config.refresh_token_encrypted)
    }

    return {
      authType,
      token,
      refreshToken,
      tokenExpiresAt: config.token_expires_at ?? null,
      hubId: config.hub_id ?? null,
      workspaceId,
      isActive: data.is_active,
      status: data.status,
    }
  } catch (err) {
    log.error('Failed to decrypt HubSpot credentials:', err)
    return null
  }
}

/**
 * Retrieve and decrypt HubSpot credentials for a workspace (RLS-protected session client).
 */
export async function getHubSpotCredentials(
  workspaceId: string
): Promise<HubSpotCredentials | null> {
  const supabase = await createClient()
  return _getCredentials(supabase, workspaceId)
}

/**
 * Retrieve and decrypt HubSpot credentials using the admin (service-role) client.
 * Bypasses RLS — use only in agent routes / background jobs that validate access independently.
 */
export async function getHubSpotCredentialsAdmin(
  workspaceId: string
): Promise<HubSpotCredentials | null> {
  const supabase = createAdminClient()
  return _getCredentials(supabase, workspaceId)
}
