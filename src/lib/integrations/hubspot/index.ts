/**
 * HubSpot Integration Module
 *
 * Exports all HubSpot CRM integration components:
 * - Types: API response types, connection config, sync state
 * - Auth: OAuth flow and Private App token validation
 * - Config: Credential retrieval, constants, connection resolution
 * - Client: HubSpot API client
 * - Entities: Entity operations (upsert, batch create, custom properties)
 * - Associations: Association management
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
  resolveHubSpotConnectionAdmin,
  type HubSpotCredentials,
} from './config'
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
