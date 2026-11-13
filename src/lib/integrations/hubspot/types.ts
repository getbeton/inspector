/**
 * HubSpot Integration Types
 *
 * Type definitions for HubSpot CRM API responses, connection configuration,
 * sync state, and rate limiting.
 */

// ============================================
// HubSpot Object Types
// ============================================

export type HubSpotObjectType =
  | 'contacts'
  | 'companies'
  | 'deals'
  | 'tickets'
  | 'line_items'
  | 'products'
  | 'quotes'

/** Standard HubSpot CRM object types that most accounts have */
export const STANDARD_OBJECT_TYPES: HubSpotObjectType[] = [
  'contacts',
  'companies',
  'deals',
  'tickets',
]

// ============================================
// HubSpot API Response Types
// ============================================

export interface HubSpotProperty {
  [key: string]: string | number | boolean | null
}

export interface HubSpotRecord {
  id: string
  properties: HubSpotProperty
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface HubSpotContact extends HubSpotRecord {
  properties: HubSpotProperty & {
    email?: string
    firstname?: string
    lastname?: string
    phone?: string
    company?: string
    jobtitle?: string
    lifecyclestage?: string
    lastmodifieddate?: string
    createdate?: string
  }
}

export interface HubSpotCompany extends HubSpotRecord {
  properties: HubSpotProperty & {
    name?: string
    domain?: string
    industry?: string
    numberofemployees?: string
    annualrevenue?: string
    city?: string
    state?: string
    country?: string
    lastmodifieddate?: string
    createdate?: string
  }
}

export interface HubSpotDeal extends HubSpotRecord {
  properties: HubSpotProperty & {
    dealname?: string
    dealstage?: string
    pipeline?: string
    amount?: string
    closedate?: string
    hubspot_owner_id?: string
    lastmodifieddate?: string
    createdate?: string
  }
}

export interface HubSpotTicket extends HubSpotRecord {
  properties: HubSpotProperty & {
    subject?: string
    content?: string
    hs_pipeline?: string
    hs_pipeline_stage?: string
    hs_ticket_priority?: string
    lastmodifieddate?: string
    createdate?: string
  }
}

export interface HubSpotCustomObject extends HubSpotRecord {
  objectTypeId: string
}

// ============================================
// HubSpot Pagination
// ============================================

export interface HubSpotPaging {
  next?: {
    after: string
    link?: string
  }
}

export interface HubSpotListResponse<T = HubSpotRecord> {
  results: T[]
  paging?: HubSpotPaging
}

// ============================================
// HubSpot Search Types
// ============================================

export interface HubSpotFilter {
  propertyName: string
  operator:
    | 'EQ'
    | 'NEQ'
    | 'LT'
    | 'LTE'
    | 'GT'
    | 'GTE'
    | 'HAS_PROPERTY'
    | 'NOT_HAS_PROPERTY'
    | 'CONTAINS_TOKEN'
    | 'NOT_CONTAINS_TOKEN'
    | 'IN'
    | 'NOT_IN'
  value?: string
  values?: string[]
  highValue?: string
}

export interface HubSpotFilterGroup {
  filters: HubSpotFilter[]
}

export interface HubSpotSort {
  propertyName: string
  direction: 'ASCENDING' | 'DESCENDING'
}

export interface HubSpotSearchOptions {
  filterGroups?: HubSpotFilterGroup[]
  sorts?: HubSpotSort[]
  query?: string
  properties?: string[]
  limit?: number
  after?: string
}

export interface HubSpotSearchResponse<T = HubSpotRecord> {
  total: number
  results: T[]
  paging?: HubSpotPaging
}

// ============================================
// HubSpot Association Types
// ============================================

export interface HubSpotAssociation {
  id: string
  type: string
}

export interface HubSpotAssociationResult {
  from: { id: string }
  to: HubSpotAssociation[]
  paging?: HubSpotPaging
}

export interface HubSpotBatchAssociationResponse {
  results: HubSpotAssociationResult[]
}

// ============================================
// HubSpot Account Info
// ============================================

export interface HubSpotAccountInfo {
  portalId: number
  accountType: string
  timeZone: string
  companyCurrency: string
  additionalCurrencies: string[]
  utcOffset: string
  utcOffsetMilliseconds: number
  uiDomain: string
  dataHostingLocation: string
}

// ============================================
// HubSpot Owner
// ============================================

export interface HubSpotOwner {
  id: string
  email: string
  firstName: string
  lastName: string
  userId: number
  createdAt: string
  updatedAt: string
  archived: boolean
}

// ============================================
// HubSpot Property Definition
// ============================================

export interface HubSpotPropertyDefinition {
  name: string
  label: string
  type: string
  fieldType: string
  description: string
  groupName: string
  options: Array<{
    label: string
    value: string
    description?: string
    displayOrder: number
    hidden: boolean
  }>
  displayOrder: number
  hasUniqueValue: boolean
  hidden: boolean
  formField: boolean
  calculated: boolean
}

// ============================================
// HubSpot Object Schema
// ============================================

export interface HubSpotObjectSchema {
  id: string
  name: string
  labels: {
    singular: string
    plural: string
  }
  requiredProperties: string[]
  searchableProperties: string[]
  primaryDisplayProperty: string
  secondaryDisplayProperties: string[]
  archived: boolean
  properties: HubSpotPropertyDefinition[]
}

// ============================================
// Connection Types
// ============================================

export type HubSpotAuthType = 'oauth' | 'private_app'

export interface HubSpotConnectionConfig {
  /** Enabled object types for syncing */
  enabled_objects?: HubSpotObjectType[]
  /** Sync interval in minutes (default: 15) */
  sync_interval_minutes?: number
  /** Custom property mappings */
  property_mappings?: Record<string, string[]>
}

export interface HubSpotConnection {
  id: string
  workspace_id: string
  name: string
  auth_type: HubSpotAuthType
  hub_id: string | null
  hub_domain: string | null
  account_name: string | null
  scopes: string[] | null
  config_json: HubSpotConnectionConfig
  is_primary: boolean
  status: 'pending' | 'connected' | 'error' | 'disconnected' | 'expired'
  last_validated_at: string | null
  last_error: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================
// OAuth Types
// ============================================

export interface HubSpotOAuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

// ============================================
// Sync Types
// ============================================

export type HubSpotSyncStatus = 'idle' | 'syncing' | 'error' | 'backfilling'

export interface HubSpotSyncState {
  id: string
  connection_id: string
  object_type: string
  last_sync_at: string | null
  last_sync_cursor: string | null
  last_modified_at: string | null
  records_synced: number
  total_records: number | null
  sync_lock_id: string | null
  sync_lock_expires_at: string | null
  status: HubSpotSyncStatus
  last_error: string | null
}

// ============================================
// Rate Limit Types
// ============================================

export type RateLimitPriority = 'high' | 'normal' | 'low'

export interface RateLimitConfig {
  /** Max tokens in the bucket */
  maxTokens: number
  /** Tokens refilled per second */
  refillRate: number
  /** Current tokens available */
  currentTokens: number
  /** Last refill timestamp */
  lastRefill: number
}

export interface RateLimitHeaders {
  /** Remaining requests in the current window */
  remaining: number
  /** Total requests allowed in the window */
  limit: number
  /** Seconds until the limit resets */
  reset: number
  /** Retry-After value from 429 responses */
  retryAfter?: number
}

// ============================================
// Engagement Types
// ============================================

export interface HubSpotEngagement {
  id: string
  properties: HubSpotProperty & {
    hs_timestamp?: string
    hubspot_owner_id?: string
    hs_engagement_type?: string
  }
  createdAt: string
  updatedAt: string
  archived: boolean
}

// ============================================
// Error Types
// ============================================

export class HubSpotError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HubSpotError'
  }
}

export class HubSpotAuthError extends HubSpotError {
  constructor(message: string) {
    super(message)
    this.name = 'HubSpotAuthError'
  }
}

export class HubSpotRateLimitError extends HubSpotError {
  retryAfter: number

  constructor(message: string, retryAfter: number = 10) {
    super(message)
    this.name = 'HubSpotRateLimitError'
    this.retryAfter = retryAfter
  }
}

export class HubSpotNotFoundError extends HubSpotError {
  constructor(message: string) {
    super(message)
    this.name = 'HubSpotNotFoundError'
  }
}

export class HubSpotValidationError extends HubSpotError {
  constructor(message: string) {
    super(message)
    this.name = 'HubSpotValidationError'
  }
}
