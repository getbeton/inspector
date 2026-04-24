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
  selectOptions?: Array<{ value: string; label: string }>
  /** For record-reference attributes: allowed target object slugs (e.g. ['people']). */
  targetObjectSlugs?: string[]
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
  webUrl?: string
  /** True when the upsert produced a brand-new record (vs matched an existing one). */
  wasCreated?: boolean
}

export interface AttioWorkspaceMember {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  accessLevel: 'admin' | 'member' | 'suspended' | string
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
      config?: {
        record_reference?: {
          allowed_objects?: Array<{ api_slug?: string }>
          allowed_object_ids?: string[]
        }
      }
    }>
  }>(response)

  const attributes: AttioAttribute[] = (data.data || []).map((attr) => {
    const allowed = attr.config?.record_reference?.allowed_objects ?? []
    const slugs = allowed
      .map((o) => o.api_slug)
      .filter((s): s is string => !!s)
    return {
      id: attr.id?.attribute_id || '',
      slug: attr.api_slug || '',
      title: attr.title || '',
      type: attr.type || '',
      isRequired: attr.is_required || false,
      isUnique: attr.is_unique || false,
      isWritable: attr.is_writable !== false,
      targetObjectSlugs: slugs.length ? slugs : undefined,
    }
  })

  // Fetch select/status options for applicable attributes (in parallel)
  const optionFetches = attributes
    .filter((attr) => attr.type === 'select' || attr.type === 'status')
    .map(async (attr) => {
      const options =
        attr.type === 'status'
          ? await fetchStatusOptions(apiKey, objectSlug, attr.slug)
          : await fetchSelectOptions(apiKey, objectSlug, attr.slug)
      return { slug: attr.slug, options }
    })

  const optionResults = await Promise.all(optionFetches)
  const optionsMap = new Map(optionResults.map((r) => [r.slug, r.options]))

  // Merge options into attribute objects
  for (const attr of attributes) {
    const options = optionsMap.get(attr.slug)
    if (options && options.length > 0) {
      attr.selectOptions = options
    }
  }

  return attributes
}

/**
 * Fetch select options for a select-type attribute.
 * @see https://docs.attio.com/rest-api/endpoint-reference/attributes/list-select-options
 */
async function fetchSelectOptions(
  apiKey: string,
  objectSlug: string,
  attributeSlug: string
): Promise<Array<{ value: string; label: string }>> {
  try {
    const response = await fetch(
      `${ATTIO_BASE_URL}/objects/${objectSlug}/attributes/${attributeSlug}/options`,
      { method: 'GET', headers: createHeaders(apiKey) }
    )
    const data = await handleResponse<{
      data?: Array<{
        id?: { option_id?: string }
        title?: string
        is_archived?: boolean
      }>
    }>(response)
    return (data.data || [])
      .filter((opt) => !opt.is_archived)
      .map((opt) => ({
        value: opt.title || opt.id?.option_id || '',
        label: opt.title || '',
      }))
  } catch {
    // Non-critical: return empty if options can't be fetched
    return []
  }
}

/**
 * Fetch statuses for a status-type attribute.
 * @see https://docs.attio.com/rest-api/endpoint-reference/attributes/list-statuses
 */
async function fetchStatusOptions(
  apiKey: string,
  objectSlug: string,
  attributeSlug: string
): Promise<Array<{ value: string; label: string }>> {
  try {
    const response = await fetch(
      `${ATTIO_BASE_URL}/objects/${objectSlug}/attributes/${attributeSlug}/statuses`,
      { method: 'GET', headers: createHeaders(apiKey) }
    )
    const data = await handleResponse<{
      data?: Array<{
        id?: { status_id?: string }
        title?: string
        is_archived?: boolean
      }>
    }>(response)
    return (data.data || [])
      .filter((s) => !s.is_archived)
      .map((s) => ({
        value: s.title || s.id?.status_id || '',
        label: s.title || '',
      }))
  } catch {
    // Non-critical: return empty if statuses can't be fetched
    return []
  }
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
      web_url?: string
      created_at?: string
      updated_at?: string
    }
  }>(response)

  const record = data.data || {}
  // Attio's upsert response returns created_at + updated_at. If they match to the second,
  // the record was newly created. This is the only signal we get — there's no explicit flag.
  const created = record.created_at ?? ''
  const updated = record.updated_at ?? ''
  const wasCreated = Boolean(created) && created.slice(0, 19) === updated.slice(0, 19)
  return {
    recordId: record.id?.record_id || '',
    action: wasCreated ? 'created' : 'updated',
    matchingAttribute,
    webUrl: record.web_url,
    wasCreated,
  }
}

/**
 * Create a new record (no upsert).
 * Use this when there's no natural unique key to match on — e.g. Deals, Notes.
 *
 * @see https://docs.attio.com/rest-api/endpoint-reference/records/create-a-record
 */
export async function createRecord(
  apiKey: string,
  objectSlug: string,
  values: Record<string, unknown>
): Promise<AttioUpsertResult> {
  const formattedValues: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) {
      formattedValues[key] = value
    }
  }

  const response = await fetch(`${ATTIO_BASE_URL}/objects/${objectSlug}/records`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify({ data: { values: formattedValues } }),
  })

  const data = await handleResponse<{
    data?: {
      id?: { record_id?: string }
    }
  }>(response)

  const record = data.data || {}
  return {
    recordId: record.id?.record_id || '',
    action: 'created',
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

// ============================================
// Lists: Create, add entries, sync
// ============================================

/**
 * Create a new list in Attio
 */
export async function createList(
  apiKey: string,
  name: string,
  parentObject: string = 'people'
): Promise<{ listId: string; listName: string }> {
  const response = await fetch(`${ATTIO_BASE_URL}/lists`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify({
      name,
      parent_object: parentObject,
    }),
  })

  const data = await handleResponse<{
    data?: {
      id?: { list_id?: string }
      name?: string
    }
  }>(response)

  return {
    listId: data.data?.id?.list_id || '',
    listName: data.data?.name || name,
  }
}

/**
 * Add a record to a list by parent record ID
 */
export async function addListEntry(
  apiKey: string,
  listId: string,
  parentRecordId: string
): Promise<{ entryId: string }> {
  const response = await fetch(`${ATTIO_BASE_URL}/lists/${listId}/entries`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify({
      data: {
        parent_record_id: parentRecordId,
      },
    }),
  })

  const data = await handleResponse<{
    data?: {
      id?: { entry_id?: string }
    }
  }>(response)

  return {
    entryId: data.data?.id?.entry_id || '',
  }
}

/**
 * Query all entries in a list
 */
export async function queryListEntries(
  apiKey: string,
  listId: string
): Promise<Array<{ entryId: string; parentRecordId: string }>> {
  const response = await fetch(`${ATTIO_BASE_URL}/lists/${listId}/entries/query`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify({ limit: 500 }),
  })

  const data = await handleResponse<{
    data?: Array<{
      id?: { entry_id?: string }
      parent_record_id?: string
    }>
  }>(response)

  return (data.data || []).map((entry) => ({
    entryId: entry.id?.entry_id || '',
    parentRecordId: entry.parent_record_id || '',
  }))
}

/**
 * Delete a list entry by ID
 */
export async function deleteListEntry(
  apiKey: string,
  listId: string,
  entryId: string
): Promise<void> {
  const response = await fetch(`${ATTIO_BASE_URL}/lists/${listId}/entries/${entryId}`, {
    method: 'DELETE',
    headers: createHeaders(apiKey),
  })

  if (!response.ok) {
    await handleResponse(response)
  }
}

/**
 * Upsert person records from email addresses, return record IDs.
 * Maps PostHog distinct_id (usually email) to Attio person record ID.
 * Uses existing upsertRecord() internally, batched with Promise.allSettled.
 */
export async function upsertPersonRecords(
  apiKey: string,
  emails: string[]
): Promise<Array<{ email: string; recordId: string }>> {
  const results = await Promise.allSettled(
    emails.map(async (email) => {
      const result = await upsertRecord(
        apiKey,
        'people',
        { email_addresses: email },
        'email_addresses'
      )
      return { email, recordId: result.recordId }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<{ email: string; recordId: string }> =>
      r.status === 'fulfilled'
    )
    .map((r) => r.value)
}

// ============================================
// Entity linking helpers
// ============================================

/**
 * List workspace members (humans who can be Deal/Person/Company owners).
 * Suspended members are filtered out so they never resolve at sync time.
 *
 * @see https://docs.attio.com/rest-api/endpoint-reference/workspace-members/list-workspace-members
 */
export async function listWorkspaceMembers(
  apiKey: string
): Promise<AttioWorkspaceMember[]> {
  const response = await fetch(`${ATTIO_BASE_URL}/workspace_members`, {
    method: 'GET',
    headers: createHeaders(apiKey),
  })
  const data = await handleResponse<{
    data?: Array<{
      id?: { workspace_member_id?: string }
      first_name?: string
      last_name?: string
      email_address?: string
      avatar_url?: string | null
      access_level?: string
    }>
  }>(response)

  return (data.data || [])
    .map((m) => ({
      id: m.id?.workspace_member_id || '',
      email: m.email_address || '',
      firstName: m.first_name || '',
      lastName: m.last_name || '',
      avatarUrl: m.avatar_url ?? null,
      accessLevel: m.access_level || 'member',
    }))
    .filter((m) => m.accessLevel !== 'suspended')
}

/**
 * Assert a Person by email (find or create). Also returns the Person's
 * linked Company record_id if any, so callers can reuse without a second
 * query.
 */
export async function assertPersonByEmail(
  apiKey: string,
  email: string
): Promise<{ recordId: string; wasCreated: boolean; companyRecordId: string | null; webUrl?: string }> {
  // Attio's People assert endpoint accepts a bare email string as
  // email_addresses under the shorthand form.
  const result = await upsertRecord(
    apiKey,
    'people',
    { email_addresses: email },
    'email_addresses'
  )

  // Fetch the Person record to read the linked company (no dedicated field on
  // the assert response). Cheap call and lets us power `via_person` resolution.
  let companyRecordId: string | null = null
  if (result.recordId) {
    const person = await getRecord(apiKey, 'people', result.recordId)
    const company = person?.values?.company
    if (Array.isArray(company) && company.length > 0) {
      const first = company[0] as { target_record_id?: string } | undefined
      companyRecordId = first?.target_record_id ?? null
    }
  }

  return {
    recordId: result.recordId,
    wasCreated: Boolean(result.wasCreated),
    companyRecordId,
    webUrl: result.webUrl,
  }
}

/**
 * Assert a Company by domain (find or create).
 */
export async function assertCompanyByDomain(
  apiKey: string,
  domain: string
): Promise<{ recordId: string; wasCreated: boolean; webUrl?: string }> {
  const result = await upsertRecord(
    apiKey,
    'companies',
    { domains: domain },
    'domains'
  )
  return {
    recordId: result.recordId,
    wasCreated: Boolean(result.wasCreated),
    webUrl: result.webUrl,
  }
}

/**
 * Link an existing Person record to an existing Company by setting the
 * Person's `company` attribute. Idempotent — Attio silently no-ops if the
 * link already exists.
 */
export async function linkPersonToCompany(
  apiKey: string,
  personRecordId: string,
  companyRecordId: string
): Promise<void> {
  const response = await fetch(
    `${ATTIO_BASE_URL}/objects/people/records/${personRecordId}`,
    {
      method: 'PATCH',
      headers: createHeaders(apiKey),
      body: JSON.stringify({
        data: {
          values: {
            company: [
              { target_object: 'companies', target_record_id: companyRecordId },
            ],
          },
        },
      }),
    }
  )
  if (!response.ok) {
    await handleResponse(response)
  }
}

/**
 * Search records by a human query (name/email/domain) for the type-ahead
 * picker. Uses Attio's query endpoint with a broad filter.
 */
export async function searchRecordsForPicker(
  apiKey: string,
  objectSlug: string,
  q: string,
  limit: number = 10
): Promise<Array<{ id: string; display: string; secondary?: string }>> {
  const query = q.trim()
  if (!query) return []

  // Attio doesn't have a cross-attribute "search" operator; we query by the
  // most useful attribute per object and fall back to name.
  const filter = buildSearchFilter(objectSlug, query)

  const response = await fetch(
    `${ATTIO_BASE_URL}/objects/${objectSlug}/records/query`,
    {
      method: 'POST',
      headers: createHeaders(apiKey),
      body: JSON.stringify({ filter, limit }),
    }
  )

  const data = await handleResponse<{
    data?: Array<{
      id?: { record_id?: string }
      values?: Record<string, unknown>
    }>
  }>(response)

  return (data.data || []).map((rec) => ({
    id: rec.id?.record_id || '',
    display: pickDisplayForRecord(objectSlug, rec.values || {}),
    secondary: pickSecondaryForRecord(objectSlug, rec.values || {}),
  }))
}

function buildSearchFilter(objectSlug: string, q: string): Record<string, unknown> {
  // Attio query filter. Use $contains where available.
  if (objectSlug === 'people') {
    return { email_addresses: { email_address: { $contains: q } } }
  }
  if (objectSlug === 'companies') {
    return { domains: { domain: { $contains: q } } }
  }
  // Fallback: filter by name
  return { name: { $contains: q } }
}

function pickDisplayForRecord(
  objectSlug: string,
  values: Record<string, unknown>
): string {
  if (objectSlug === 'people') {
    const name = extractFirstTextValue(values.name, 'full_name') ?? ''
    const email = extractFirstTextValue(values.email_addresses, 'email_address') ?? ''
    return name || email || '(unnamed)'
  }
  if (objectSlug === 'companies') {
    const name = extractFirstTextValue(values.name, 'value') ?? ''
    const domain = extractFirstTextValue(values.domains, 'domain') ?? ''
    return name || domain || '(unnamed)'
  }
  const name = extractFirstTextValue(values.name, 'value') ?? ''
  return name || '(unnamed)'
}

function pickSecondaryForRecord(
  objectSlug: string,
  values: Record<string, unknown>
): string | undefined {
  if (objectSlug === 'people') {
    return extractFirstTextValue(values.email_addresses, 'email_address') ?? undefined
  }
  if (objectSlug === 'companies') {
    return extractFirstTextValue(values.domains, 'domain') ?? undefined
  }
  return undefined
}

function extractFirstTextValue(
  val: unknown,
  key: string
): string | null {
  if (!Array.isArray(val) || val.length === 0) return null
  const first = val[0] as Record<string, unknown> | undefined
  if (!first) return null
  const v = first[key]
  if (typeof v === 'string' && v.length > 0) return v
  // Fallback to `value` field which some Attio attributes nest under.
  const alt = first.value
  if (typeof alt === 'string' && alt.length > 0) return alt
  return null
}

/**
 * Sync list entries: add missing records, remove stale ones.
 * Returns counts of added and removed entries.
 */
export async function syncListEntries(
  apiKey: string,
  listId: string,
  desiredRecordIds: string[]
): Promise<{ added: number; removed: number }> {
  // 1. Query current entries
  const currentEntries = await queryListEntries(apiKey, listId)
  const currentRecordIds = new Set(currentEntries.map((e) => e.parentRecordId))
  const desiredSet = new Set(desiredRecordIds)

  // 2. Compute diff
  const toAdd = desiredRecordIds.filter((id) => !currentRecordIds.has(id))
  const toRemove = currentEntries.filter((e) => !desiredSet.has(e.parentRecordId))

  // 3. Add new entries
  const addResults = await Promise.allSettled(
    toAdd.map((recordId) => addListEntry(apiKey, listId, recordId))
  )
  const addedCount = addResults.filter((r) => r.status === 'fulfilled').length

  // 4. Remove stale entries
  const removeResults = await Promise.allSettled(
    toRemove.map((entry) => deleteListEntry(apiKey, listId, entry.entryId))
  )
  const removedCount = removeResults.filter((r) => r.status === 'fulfilled').length

  return { added: addedCount, removed: removedCount }
}
