/**
 * HubSpot Integration Module
 *
 * Exports HubSpot CRM integration components:
 * - Types: API response types, connection config
 * - Auth: OAuth flow and Private App token validation
 * - Config: integration_configs-backed credential retrieval + constants
 * - Client: HubSpot API client
 * - Entities: Entity operations (upsert, batch create, custom properties)
 * - Associations: Association management
 * - Rate Limiter: Token bucket rate limiting
 *
 * Note: durable incremental sync / record landing is handled by the F1 runs
 * orchestrator (the old `polling.ts` + `hubspot_*` tables were dropped); the
 * SourceAdapter exposes per-page reads and a config_json watermark for F1.
 */

export * from './types'
export * from './auth'
export {
  HUBSPOT_API_BASE,
  HUBSPOT_INTEGRATION_NAME,
  DEFAULT_OAUTH_SCOPES,
  RATE_LIMITS as HUBSPOT_RATE_LIMITS,
  SYNC_CONFIG as HUBSPOT_SYNC_CONFIG,
  getHubSpotCredentials,
  getHubSpotCredentialsAdmin,
  type HubSpotCredentials,
  type HubSpotConfigJson,
} from './config'
export {
  HubSpotClient,
  createHubSpotClient,
  createHubSpotClientForWorkspace,
  type HubSpotClientConfig,
} from './client'
export {
  upsertCompany,
  upsertContact,
  createDeal,
  batchCreateChain,
  ensureBetonProperties,
  buildHubSpotUrl,
  getBetonPropertyDefinitions,
  type UpsertResult,
  type EntityResult,
  type BatchCreateChainOptions,
  type BatchCreateChainResult,
} from './entities'
export {
  createAssociation,
  batchCreateAssociations,
  ASSOCIATION_TYPE_IDS,
  type AssociationInput,
} from './associations'
