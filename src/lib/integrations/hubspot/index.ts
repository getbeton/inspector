/**
 * HubSpot Integration Module
 *
 * Exports all HubSpot CRM integration components:
 * - Types: API response types, connection config, sync state
 * - Auth: OAuth flow and Private App token validation
 * - Config: Credential retrieval, constants, connection resolution
 * - Client: HubSpot API client (Phase 2)
 */

export * from './types'
export * from './auth'
export {
  HUBSPOT_API_BASE,
  DEFAULT_OAUTH_SCOPES,
  RATE_LIMITS as HUBSPOT_RATE_LIMITS,
  SYNC_CONFIG as HUBSPOT_SYNC_CONFIG,
  getHubSpotConnectionCredentials,
  getHubSpotConnectionCredentialsAdmin,
  resolveHubSpotConnection,
  type HubSpotCredentials,
} from './config'
