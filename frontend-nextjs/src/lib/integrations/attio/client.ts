/**
 * Attio CRM API Client
 *
 * Provides functionality for:
 * - Connection validation
 * - Object/attribute discovery
 * - Record upserts (create or update)
 * - Health checks
 */

const ATTIO_BASE_URL = 'https://api.attio.com/v2'

/**
 * Error types for Attio API
 */
export class AttioError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AttioError'
  }
}

export class AttioAuthError extends AttioError {
  constructor(message: string) {
    super(message)
    this.name = 'AttioAuthError'
  }
}

export class AttioRateLimitError extends AttioError {
  retryAfter: number

  constructor(message: string, retryAfter: number = 60) {
    super(message)
    this.name = 'AttioRateLimitError'
    this.retryAfter = retryAfter
  }
}

export class AttioNotFoundError extends AttioError {
  constructor(message: string) {
    super(message)
    this.name = 'AttioNotFoundError'
  }
}

export class AttioValidationError extends AttioError {
  constructor(message: string) {
    super(message)
    this.name = 'AttioValidationError'
  }
}

/**
 * Attio object representation
 */
export interface AttioObject {
  id: string
  slug: string
  singularNoun: string
  pluralNoun: string
}

/**
 * Attio attribute representation
 */
export interface AttioAttribute {
  id: string
  slug: string
  title: string
  type: string
  isRequired: boolean
  isUnique: boolean
  isWritable: boolean
}

/**
 * Attio record representation
 */
export interface AttioRecord {
  id: string
  objectSlug: string
  values: Record<string, unknown>
  createdAt?: string
}

/**
 * Upsert result
 */
export interface AttioUpsertResult {
  recordId: string
  action: 'created' | 'updated' | 'upserted'
  matchingAttribute?: string
}

/**
 * Connection validation result
 */
export interface AttioConnectionResult {
  valid: boolean
  workspaceId?: string
  workspaceName?: string
  userEmail?: string
}

/**
 * Health check result
 */
export interface AttioHealthResult {
  healthy: boolean
  status: 'connected' | 'auth_error' | 'error' | 'unknown_error'
  workspaceName?: string
  userEmail?: string
  error?: string
}

/**
 * Handle Attio API response and throw appropriate errors
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.json()
  }

  let errorBody: { message?: string } = {}
  try {
    errorBody = await response.json()
  } catch {
    // Ignore JSON parse errors
  }

  const errorMessage = errorBody.message || response.statusText

  switch (response.status) {
    case 401:
      throw new AttioAuthError(`Authentication failed: ${errorMessage}`)
    case 403:
      throw new AttioAuthError(`Access forbidden: ${errorMessage}`)
    case 404:
      throw new AttioNotFoundError(`Resource not found: ${errorMessage}`)
    case 422:
      throw new AttioValidationError(`Validation failed: ${errorMessage}`)
    case 429: {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10)
      throw new AttioRateLimitError(`Rate limit exceeded: ${errorMessage}`, retryAfter)
    }
    default:
      throw new AttioError(`API error (${response.status}): ${errorMessage}`)
  }
}

/**
 * Create headers for Attio API requests
 */
function createHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

/**
 * Validate Attio API connection
 */
export async function validateConnection(apiKey: string): Promise<AttioConnectionResult> {
  const response = await fetch(`${ATTIO_BASE_URL}/self`, {
    method: 'GET',
    headers: createHeaders(apiKey),
  })

  const data = await handleResponse<{
    workspace?: { id?: string; name?: string }
    user?: { email_address?: string }
  }>(response)

  return {
    valid: true,
    workspaceId: data.workspace?.id,
    workspaceName: data.workspace?.name,
    userEmail: data.user?.email_address,
  }
}

/**
 * Discover all objects in the Attio workspace
 */
export async function discoverObjects(apiKey: string): Promise<AttioObject[]> {
  const response = await fetch(`${ATTIO_BASE_URL}/objects`, {
    method: 'GET',
    headers: createHeaders(apiKey),
  })

  const data = await handleResponse<{
    data?: Array<{
      id?: { object_id?: string }
      api_slug?: string
      singular_noun?: string
      plural_noun?: string
    }>
  }>(response)

  return (data.data || []).map((obj) => ({
    id: obj.id?.object_id || '',
    slug: obj.api_slug || '',
    singularNoun: obj.singular_noun || '',
    pluralNoun: obj.plural_noun || '',
  }))
}

/**
 * Get all attributes for an object
 */
export async function getObjectAttributes(
  apiKey: string,
  objectSlug: string
): Promise<AttioAttribute[]> {
  const response = await fetch(`${ATTIO_BASE_URL}/objects/${objectSlug}/attributes`, {
    method: 'GET',
    headers: createHeaders(apiKey),
  })

  const data = await handleResponse<{
    data?: Array<{
      id?: { attribute_id?: string }
      api_slug?: string
      title?: string
      type?: string
      is_required?: boolean
      is_unique?: boolean
      is_writable?: boolean
    }>
  }>(response)

  return (data.data || []).map((attr) => ({
    id: attr.id?.attribute_id || '',
    slug: attr.api_slug || '',
    title: attr.title || '',
    type: attr.type || '',
    isRequired: attr.is_required || false,
    isUnique: attr.is_unique || false,
    isWritable: attr.is_writable !== false,
  }))
}

/**
 * Create a new attribute on an object
 */
export async function createAttribute(
  apiKey: string,
  objectSlug: string,
  options: {
    title: string
    apiSlug: string
    type?: string
    isRequired?: boolean
    isUnique?: boolean
  }
): Promise<AttioAttribute> {
  const response = await fetch(`${ATTIO_BASE_URL}/objects/${objectSlug}/attributes`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify({
      title: options.title,
      api_slug: options.apiSlug,
      type: options.type || 'text',
      is_required: options.isRequired || false,
      is_unique: options.isUnique || false,
    }),
  })

  const data = await handleResponse<{
    data?: {
      id?: { attribute_id?: string }
      api_slug?: string
      title?: string
      type?: string
    }
  }>(response)

  const attr = data.data || {}
  return {
    id: attr.id?.attribute_id || '',
    slug: attr.api_slug || options.apiSlug,
    title: attr.title || options.title,
    type: attr.type || options.type || 'text',
    isRequired: options.isRequired || false,
    isUnique: options.isUnique || false,
    isWritable: true,
  }
}

/**
 * Upsert a record (create or update based on matching attribute)
 */
export async function upsertRecord(
  apiKey: string,
  objectSlug: string,
  values: Record<string, unknown>,
  matchingAttribute: string = 'domain'
): Promise<AttioUpsertResult> {
  // Filter out null/undefined values
  const formattedValues: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) {
      formattedValues[key] = value
    }
  }

  const payload: {
    data: {
      values: Record<string, unknown>
      matching_attribute?: string
    }
  } = {
    data: {
      values: formattedValues,
    },
  }

  // Add matching attribute for upsert
  if (matchingAttribute && matchingAttribute in values) {
    payload.data.matching_attribute = matchingAttribute
  }

  const response = await fetch(`${ATTIO_BASE_URL}/objects/${objectSlug}/records`, {
    method: 'PUT',
    headers: createHeaders(apiKey),
    body: JSON.stringify(payload),
  })

  const data = await handleResponse<{
    data?: {
      id?: { record_id?: string }
    }
  }>(response)

  const record = data.data || {}
  return {
    recordId: record.id?.record_id || '',
    action: 'upserted',
    matchingAttribute,
  }
}

/**
 * Get a specific record by ID
 */
export async function getRecord(
  apiKey: string,
  objectSlug: string,
  recordId: string
): Promise<AttioRecord | null> {
  try {
    const response = await fetch(`${ATTIO_BASE_URL}/objects/${objectSlug}/records/${recordId}`, {
      method: 'GET',
      headers: createHeaders(apiKey),
    })

    const data = await handleResponse<{
      data?: {
        id?: { record_id?: string }
        values?: Record<string, unknown>
        created_at?: string
      }
    }>(response)

    const record = data.data || {}
    return {
      id: record.id?.record_id || '',
      objectSlug,
      values: record.values || {},
      createdAt: record.created_at,
    }
  } catch (err) {
    if (err instanceof AttioNotFoundError) {
      return null
    }
    throw err
  }
}

/**
 * Search for records by attribute value
 */
export async function searchRecords(
  apiKey: string,
  objectSlug: string,
  filterAttribute: string,
  filterValue: unknown,
  limit: number = 100
): Promise<AttioRecord[]> {
  const response = await fetch(`${ATTIO_BASE_URL}/objects/${objectSlug}/records/query`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify({
      filter: {
        [filterAttribute]: filterValue,
      },
      limit,
    }),
  })

  const data = await handleResponse<{
    data?: Array<{
      id?: { record_id?: string }
      values?: Record<string, unknown>
      created_at?: string
    }>
  }>(response)

  return (data.data || []).map((record) => ({
    id: record.id?.record_id || '',
    objectSlug,
    values: record.values || {},
    createdAt: record.created_at,
  }))
}

/**
 * Perform a health check on the Attio integration
 */
export async function healthCheck(apiKey: string): Promise<AttioHealthResult> {
  try {
    const validation = await validateConnection(apiKey)
    return {
      healthy: true,
      status: 'connected',
      workspaceName: validation.workspaceName,
      userEmail: validation.userEmail,
    }
  } catch (err) {
    if (err instanceof AttioAuthError) {
      return {
        healthy: false,
        status: 'auth_error',
        error: err.message,
      }
    }
    if (err instanceof AttioError) {
      return {
        healthy: false,
        status: 'error',
        error: err.message,
      }
    }
    return {
      healthy: false,
      status: 'unknown_error',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Test connection (alias for validateConnection with error handling)
 */
export async function testConnection(apiKey: string): Promise<{
  success: boolean
  message: string
  details?: AttioConnectionResult
}> {
  try {
    const result = await validateConnection(apiKey)
    return {
      success: true,
      message: `Connected to workspace: ${result.workspaceName}`,
      details: result,
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}
