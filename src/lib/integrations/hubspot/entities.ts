/**
 * HubSpot Entity Operations (Destination)
 *
 * Provides entity creation and management for HubSpot CRM:
 * - upsertCompany: search by domain, create or update
 * - upsertContact: search by email, create or update
 * - createDeal: create deal (no dedup by default)
 * - batchCreateChain: company -> contact -> deal with associations
 * - ensureBetonProperties: auto-create beton_* custom properties
 * - buildHubSpotUrl: URL builder for deep links
 *
 * Uses HubSpot v3 CRM API endpoints.
 */

import type { HubSpotClient } from './client'
import type { HubSpotRecord, HubSpotPropertyDefinition } from './types'
import { HubSpotError, HubSpotValidationError, HubSpotNotFoundError } from './types'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot Entities]')

// ============================================
// Types
// ============================================

export interface UpsertResult {
  recordId: string
  action: 'created' | 'updated'
  objectType: string
}

export interface EntityResult {
  record_id: string
  object_type: string
  hubspot_url: string | null
}

export interface BatchCreateChainOptions {
  /** Portal ID for building URLs */
  portalId?: string | number | null
  /** Company data (domain, name, etc.) */
  companyData?: Record<string, unknown>
  /** Contact data (email, firstname, lastname, etc.) */
  contactData?: Record<string, unknown>
  /** Deal data (dealname, pipeline, etc.) */
  dealData?: Record<string, unknown>
  /** Whether to create company */
  createCompany?: boolean
  /** Whether to create contact */
  createContact?: boolean
  /** Whether to create deal */
  createDeal?: boolean
}

export interface BatchCreateChainResult {
  company?: EntityResult
  contact?: EntityResult
  deal?: EntityResult
  error?: string
  partial?: boolean
}

// ============================================
// Beton Custom Properties
// ============================================

/** Property group name for all Beton-created properties */
const BETON_GROUP_NAME = 'beton'
const BETON_GROUP_LABEL = 'Beton Inspector'

/** Beton custom property definitions */
const BETON_PROPERTIES: Array<{
  name: string
  label: string
  type: string
  fieldType: string
  description: string
  objectTypes: string[]
  options?: Array<{ label: string; value: string; displayOrder: number; hidden: boolean }>
}> = [
  {
    name: 'beton_health_score',
    label: 'Beton Health Score',
    type: 'number',
    fieldType: 'number',
    description: 'Account health score calculated by Beton Inspector (0-100)',
    objectTypes: ['companies', 'contacts'],
  },
  {
    name: 'beton_expansion_score',
    label: 'Beton Expansion Score',
    type: 'number',
    fieldType: 'number',
    description: 'Account expansion potential score calculated by Beton Inspector (0-100)',
    objectTypes: ['companies'],
  },
  {
    name: 'beton_churn_risk_score',
    label: 'Beton Churn Risk Score',
    type: 'number',
    fieldType: 'number',
    description: 'Account churn risk score calculated by Beton Inspector (0-100)',
    objectTypes: ['companies'],
  },
  {
    name: 'beton_concrete_grade',
    label: 'Beton Concrete Grade',
    type: 'enumeration',
    fieldType: 'select',
    description: 'Account concrete grade from Beton Inspector',
    objectTypes: ['companies'],
    options: [
      { label: 'M100', value: 'M100', displayOrder: 0, hidden: false },
      { label: 'M75', value: 'M75', displayOrder: 1, hidden: false },
      { label: 'M50', value: 'M50', displayOrder: 2, hidden: false },
      { label: 'M25', value: 'M25', displayOrder: 3, hidden: false },
      { label: 'M10', value: 'M10', displayOrder: 4, hidden: false },
    ],
  },
  {
    name: 'beton_signal_count',
    label: 'Beton Signal Count',
    type: 'number',
    fieldType: 'number',
    description: 'Total number of signals detected by Beton Inspector',
    objectTypes: ['companies', 'contacts'],
  },
  {
    name: 'beton_last_signal_date',
    label: 'Beton Last Signal Date',
    type: 'datetime',
    fieldType: 'date',
    description: 'Date of the most recent signal detected by Beton Inspector',
    objectTypes: ['companies', 'contacts'],
  },
  {
    name: 'beton_last_signal_type',
    label: 'Beton Last Signal Type',
    type: 'string',
    fieldType: 'text',
    description: 'Type of the most recent signal detected by Beton Inspector',
    objectTypes: ['companies', 'contacts'],
  },
]

// ============================================
// Helpers
// ============================================

/**
 * Filter out null/undefined values from a properties object.
 */
function filterNullProperties(
  properties: Record<string, unknown>
): Record<string, string | number | boolean> {
  const filtered: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value !== null && value !== undefined && value !== '') {
      // HubSpot properties must be strings, numbers, or booleans
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        filtered[key] = value
      } else {
        filtered[key] = String(value)
      }
    }
  }
  return filtered
}

/**
 * Build a HubSpot web URL for a CRM record.
 *
 * @param portalId - HubSpot portal/hub ID
 * @param objectType - CRM object type (contacts, companies, deals)
 * @param recordId - HubSpot record ID
 * @returns Full URL or null if portalId is missing
 */
export function buildHubSpotUrl(
  portalId: string | number | null | undefined,
  objectType: string,
  recordId: string
): string | null {
  if (!portalId) return null

  // Map object types to HubSpot URL paths
  const urlObjectType: Record<string, string> = {
    contacts: 'contact',
    companies: 'company',
    deals: 'deal',
    tickets: 'ticket',
  }

  const pathType = urlObjectType[objectType] || objectType
  return `https://app.hubspot.com/contacts/${portalId}/${pathType}/${recordId}`
}

// ============================================
// Upsert Operations
// ============================================

/**
 * Upsert a company in HubSpot. Searches by domain first; creates or updates.
 *
 * @param client - HubSpot API client
 * @param data - Company properties (must include domain for matching)
 * @param matchingProperty - Property to match on (default: 'domain')
 * @returns Upsert result with record ID and action taken
 */
export async function upsertCompany(
  client: HubSpotClient,
  data: Record<string, unknown>,
  matchingProperty: string = 'domain'
): Promise<UpsertResult> {
  const properties = filterNullProperties(data)
  const matchValue = properties[matchingProperty]

  if (!matchValue) {
    throw new HubSpotValidationError(
      `Missing required matching property "${matchingProperty}" for company upsert`
    )
  }

  // Search for existing company
  try {
    const searchResult = await client.search('companies', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: matchingProperty,
              operator: 'EQ',
              value: String(matchValue),
            },
          ],
        },
      ],
      properties: ['domain', 'name'],
      limit: 1,
    })

    if (searchResult.results.length > 0) {
      // Update existing company
      const existingId = searchResult.results[0].id
      await client.updateRecord('companies', existingId, properties)
      log.info(`Updated company ${existingId} (matched on ${matchingProperty}=${matchValue})`)
      return {
        recordId: existingId,
        action: 'updated',
        objectType: 'companies',
      }
    }
  } catch (err) {
    // If search fails, try creating anyway
    if (!(err instanceof HubSpotNotFoundError)) {
      log.warn('Company search failed, attempting create:', err)
    }
  }

  // Create new company
  const created = await client.createRecord('companies', properties)
  log.info(`Created company ${created.id}`)
  return {
    recordId: created.id,
    action: 'created',
    objectType: 'companies',
  }
}

/**
 * Upsert a contact in HubSpot. Searches by email first; creates or updates.
 *
 * @param client - HubSpot API client
 * @param data - Contact properties (must include email for matching)
 * @param matchingProperty - Property to match on (default: 'email')
 * @returns Upsert result with record ID and action taken
 */
export async function upsertContact(
  client: HubSpotClient,
  data: Record<string, unknown>,
  matchingProperty: string = 'email'
): Promise<UpsertResult> {
  const properties = filterNullProperties(data)
  const matchValue = properties[matchingProperty]

  if (!matchValue) {
    throw new HubSpotValidationError(
      `Missing required matching property "${matchingProperty}" for contact upsert`
    )
  }

  // Search for existing contact
  try {
    const searchResult = await client.search('contacts', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: matchingProperty,
              operator: 'EQ',
              value: String(matchValue),
            },
          ],
        },
      ],
      properties: ['email', 'firstname', 'lastname'],
      limit: 1,
    })

    if (searchResult.results.length > 0) {
      // Update existing contact
      const existingId = searchResult.results[0].id
      await client.updateRecord('contacts', existingId, properties)
      log.info(`Updated contact ${existingId} (matched on ${matchingProperty}=${matchValue})`)
      return {
        recordId: existingId,
        action: 'updated',
        objectType: 'contacts',
      }
    }
  } catch (err) {
    if (!(err instanceof HubSpotNotFoundError)) {
      log.warn('Contact search failed, attempting create:', err)
    }
  }

  // Create new contact
  const created = await client.createRecord('contacts', properties)
  log.info(`Created contact ${created.id}`)
  return {
    recordId: created.id,
    action: 'created',
    objectType: 'contacts',
  }
}

/**
 * Create a deal in HubSpot. No dedup by default.
 *
 * @param client - HubSpot API client
 * @param data - Deal properties (dealname required)
 * @returns Created deal record ID
 */
export async function createDeal(
  client: HubSpotClient,
  data: Record<string, unknown>
): Promise<UpsertResult> {
  const properties = filterNullProperties(data)

  if (!properties.dealname) {
    throw new HubSpotValidationError('dealname is required for deal creation')
  }

  const created = await client.createRecord('deals', properties)
  log.info(`Created deal ${created.id}`)
  return {
    recordId: created.id,
    action: 'created',
    objectType: 'deals',
  }
}

// ============================================
// Batch Create Chain
// ============================================

/**
 * Create a chain of company -> contact -> deal with associations.
 * Executes in sequence: company first, then contact (linked), then deal (linked).
 * Supports partial failure - returns whatever succeeded.
 *
 * @param client - HubSpot API client
 * @param opts - Chain options with entity data and flags
 * @returns Result with created entity IDs and URLs
 */
export async function batchCreateChain(
  client: HubSpotClient,
  opts: BatchCreateChainOptions
): Promise<BatchCreateChainResult> {
  const { createAssociation } = await import('./associations')
  const result: BatchCreateChainResult = {}

  // 1. Company (if requested)
  let companyId: string | undefined
  if (opts.createCompany && opts.companyData) {
    try {
      const companyResult = await upsertCompany(client, opts.companyData)
      companyId = companyResult.recordId
      result.company = {
        record_id: companyResult.recordId,
        object_type: 'companies',
        hubspot_url: buildHubSpotUrl(opts.portalId, 'companies', companyResult.recordId),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Company creation failed'
      log.error('Company creation failed:', err)
      return { ...result, error: msg, partial: false }
    }
  }

  // 2. Contact (if requested)
  let contactId: string | undefined
  if (opts.createContact && opts.contactData) {
    try {
      const contactResult = await upsertContact(client, opts.contactData)
      contactId = contactResult.recordId
      result.contact = {
        record_id: contactResult.recordId,
        object_type: 'contacts',
        hubspot_url: buildHubSpotUrl(opts.portalId, 'contacts', contactResult.recordId),
      }

      // Associate contact -> company
      if (companyId) {
        try {
          await createAssociation(client, 'contacts', contactId, 'companies', companyId)
        } catch (assocErr) {
          log.warn('Failed to associate contact to company:', assocErr)
          // Non-fatal: entities are created, just not linked
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Contact creation failed'
      log.error('Contact creation failed:', err)
      return { ...result, error: msg, partial: true }
    }
  }

  // 3. Deal (if requested)
  if (opts.createDeal && opts.dealData) {
    try {
      const dealResult = await createDeal(client, opts.dealData)
      result.deal = {
        record_id: dealResult.recordId,
        object_type: 'deals',
        hubspot_url: buildHubSpotUrl(opts.portalId, 'deals', dealResult.recordId),
      }

      // Associate deal -> company
      if (companyId) {
        try {
          await createAssociation(client, 'deals', dealResult.recordId, 'companies', companyId)
        } catch (assocErr) {
          log.warn('Failed to associate deal to company:', assocErr)
        }
      }

      // Associate deal -> contact
      if (contactId) {
        try {
          await createAssociation(client, 'deals', dealResult.recordId, 'contacts', contactId)
        } catch (assocErr) {
          log.warn('Failed to associate deal to contact:', assocErr)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deal creation failed'
      log.error('Deal creation failed:', err)
      return { ...result, error: msg, partial: true }
    }
  }

  return result
}

// ============================================
// Custom Properties
// ============================================

/**
 * Ensure the Beton property group and custom properties exist on a given object type.
 * Idempotent: skips properties that already exist.
 *
 * @param client - HubSpot API client
 * @param objectType - CRM object type ('companies', 'contacts', 'deals')
 * @returns Object with created and skipped property names
 */
export async function ensureBetonProperties(
  client: HubSpotClient,
  objectType: string
): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
  const created: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  // 1. Ensure the beton property group exists
  try {
    await client.createPropertyGroup(objectType, {
      name: BETON_GROUP_NAME,
      label: BETON_GROUP_LABEL,
      displayOrder: -1,
    })
    log.info(`Created property group "${BETON_GROUP_NAME}" on ${objectType}`)
  } catch (err) {
    // 409 Conflict means group already exists — that's fine
    if (err instanceof HubSpotError && err.message.includes('409')) {
      // Group already exists, continue
    } else if (err instanceof HubSpotValidationError) {
      // Likely already exists
    } else {
      log.warn(`Failed to create property group on ${objectType}:`, err)
      // Non-fatal: try creating properties anyway (they might work with default group)
    }
  }

  // 2. Get existing properties to check what already exists
  let existingNames: Set<string>
  try {
    const existingProps = await client.getProperties(objectType)
    existingNames = new Set(existingProps.results.map((p: HubSpotPropertyDefinition) => p.name))
  } catch (err) {
    log.error('Failed to list existing properties:', err)
    return { created: [], skipped: [], errors: ['Failed to list existing properties'] }
  }

  // 3. Create missing properties
  const applicableProps = BETON_PROPERTIES.filter((p) =>
    p.objectTypes.includes(objectType)
  )

  for (const prop of applicableProps) {
    if (existingNames.has(prop.name)) {
      skipped.push(prop.name)
      continue
    }

    try {
      const createPayload: Record<string, unknown> = {
        name: prop.name,
        label: prop.label,
        type: prop.type,
        fieldType: prop.fieldType,
        groupName: BETON_GROUP_NAME,
        description: prop.description,
      }

      if (prop.options) {
        createPayload.options = prop.options
      }

      await client.createProperty(objectType, createPayload as {
        name: string
        label: string
        type: string
        fieldType: string
        groupName: string
        description?: string
      })

      created.push(prop.name)
      log.info(`Created property "${prop.name}" on ${objectType}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`${prop.name}: ${msg}`)
      log.warn(`Failed to create property "${prop.name}" on ${objectType}:`, err)
    }
  }

  return { created, skipped, errors }
}

/**
 * Get the list of Beton property definitions for a given object type.
 * Useful for field mapping UI.
 */
export function getBetonPropertyDefinitions(objectType: string) {
  return BETON_PROPERTIES.filter((p) => p.objectTypes.includes(objectType)).map(
    (p) => ({
      name: p.name,
      label: p.label,
      type: p.type,
      fieldType: p.fieldType,
      description: p.description,
    })
  )
}
