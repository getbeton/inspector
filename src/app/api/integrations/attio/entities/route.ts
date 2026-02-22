import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import {
  upsertRecord,
  validateConnection,
  AttioRateLimitError,
  AttioValidationError,
} from '@/lib/integrations/attio/client'
import { withRetry } from '@/lib/utils/retry'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SingleEntityRequest {
  object_slug: 'companies' | 'people' | 'deals'
  attributes: Record<string, unknown>
  matching_attribute?: string
}

interface EntityResult {
  record_id: string
  object_slug: string
  attio_url: string | null
}

interface BatchEntityRequest {
  create_company?: boolean
  create_person?: boolean
  create_deal?: boolean
  company_data?: Record<string, unknown>
  person_data?: Record<string, unknown>
  deal_data?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default matching attributes per object type for upsert dedup. */
const DEFAULT_MATCH: Record<string, string> = {
  companies: 'domains',
  people: 'email_addresses',
}

/** Allowed object_slug values. */
const ALLOWED_OBJECT_SLUGS = new Set(['companies', 'people', 'deals'])

/**
 * Build an Attio web URL for a record.
 * Requires the workspace slug (lowercase name from /self).
 */
function buildAttioUrl(
  workspaceSlug: string | undefined,
  objectSlug: string,
  recordId: string
): string | null {
  if (!workspaceSlug) return null
  return `https://app.attio.com/${workspaceSlug}/${objectSlug}/${recordId}`
}

/**
 * Wraps `upsertRecord` with retry logic for rate-limit resilience.
 * Only retries on 429 (AttioRateLimitError); validation / auth errors fail fast.
 */
async function upsertWithRetry(
  apiKey: string,
  objectSlug: string,
  values: Record<string, unknown>,
  matchingAttribute: string
) {
  const result = await withRetry(
    () => upsertRecord(apiKey, objectSlug, values, matchingAttribute),
    {
      maxRetries: 3,
      initialDelayMs: 1000,
      isRetryable: (err) => err instanceof AttioRateLimitError,
    }
  )

  if (!result.success) {
    throw result.lastError ?? result.error
  }

  return result.data
}

/**
 * Resolve the workspace slug from the Attio API.
 * Called once per request — no module-level caching.
 */
async function resolveWorkspaceSlug(apiKey: string): Promise<string | undefined> {
  try {
    const self = await validateConnection(apiKey)
    return self.workspaceName?.toLowerCase().replace(/\s+/g, '-')
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// POST /api/integrations/attio/entities
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()

    const creds = await getIntegrationCredentials(workspaceId, 'attio')
    if (!creds?.apiKey) {
      return NextResponse.json({ error: 'Attio not configured' }, { status: 400 })
    }

    const body = await request.json()

    // Resolve workspace slug once per request (no cross-tenant caching)
    const workspaceSlug = await resolveWorkspaceSlug(creds.apiKey)

    // Route: batch mode vs single entity
    if (body.create_company === true || body.create_person === true || body.create_deal === true) {
      // Validate batch request fields
      if (body.create_company === true && (!body.company_data || typeof body.company_data !== 'object')) {
        return NextResponse.json({ error: 'company_data is required when create_company is true' }, { status: 400 })
      }
      if (body.create_person === true && (!body.person_data || typeof body.person_data !== 'object')) {
        return NextResponse.json({ error: 'person_data is required when create_person is true' }, { status: 400 })
      }
      if (body.create_deal === true && (!body.deal_data || typeof body.deal_data !== 'object')) {
        return NextResponse.json({ error: 'deal_data is required when create_deal is true' }, { status: 400 })
      }
      return handleBatch(creds.apiKey, body as BatchEntityRequest, workspaceSlug)
    }

    return handleSingle(creds.apiKey, body as SingleEntityRequest, workspaceSlug)
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[Attio Entities] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Single entity creation
// ---------------------------------------------------------------------------

async function handleSingle(
  apiKey: string,
  body: SingleEntityRequest,
  workspaceSlug: string | undefined
): Promise<NextResponse> {
  const { object_slug, attributes, matching_attribute } = body

  if (!object_slug || !attributes) {
    return NextResponse.json(
      { error: 'object_slug and attributes are required' },
      { status: 400 }
    )
  }

  if (!ALLOWED_OBJECT_SLUGS.has(object_slug)) {
    return NextResponse.json({ error: 'Invalid object_slug' }, { status: 400 })
  }

  try {
    const match = matching_attribute ?? DEFAULT_MATCH[object_slug] ?? 'name'
    const result = await upsertWithRetry(apiKey, object_slug, attributes, match)

    return NextResponse.json({
      record_id: result.recordId,
      object_slug,
      attio_url: buildAttioUrl(workspaceSlug, object_slug, result.recordId),
    })
  } catch (err) {
    if (err instanceof AttioValidationError) {
      return NextResponse.json(
        { error: err.message, type: 'validation' },
        { status: 422 }
      )
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Batch entity creation: company → person → deal
// ---------------------------------------------------------------------------

async function handleBatch(
  apiKey: string,
  body: BatchEntityRequest,
  workspaceSlug: string | undefined
): Promise<NextResponse> {
  const results: {
    company?: EntityResult
    person?: EntityResult
    deal?: EntityResult
    error?: string
    partial?: boolean
  } = {}

  // 1. Company (if requested)
  let companyRecordId: string | undefined
  if (body.create_company && body.company_data) {
    try {
      const match = DEFAULT_MATCH['companies']
      const result = await upsertWithRetry(apiKey, 'companies', body.company_data, match)
      companyRecordId = result.recordId
      results.company = {
        record_id: result.recordId,
        object_slug: 'companies',
        attio_url: buildAttioUrl(workspaceSlug, 'companies', result.recordId),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Company creation failed'
      return NextResponse.json(
        { error: msg, results, partial: false },
        { status: 502 }
      )
    }
  }

  // 2. Person (if requested) — link to company if available
  let personRecordId: string | undefined
  if (body.create_person && body.person_data) {
    try {
      const personValues = { ...body.person_data }
      // Link person to company via the record reference attribute
      if (companyRecordId) {
        personValues.company = companyRecordId
      }
      const match = DEFAULT_MATCH['people']
      const result = await upsertWithRetry(apiKey, 'people', personValues, match)
      personRecordId = result.recordId
      results.person = {
        record_id: result.recordId,
        object_slug: 'people',
        attio_url: buildAttioUrl(workspaceSlug, 'people', result.recordId),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Person creation failed'
      return NextResponse.json(
        { error: msg, results, partial: true },
        { status: 502 }
      )
    }
  }

  // 3. Deal (if requested) — link to company + person
  if (body.create_deal && body.deal_data) {
    try {
      const dealValues = { ...body.deal_data }
      if (companyRecordId) {
        dealValues.company = companyRecordId
      }
      if (personRecordId) {
        dealValues.person = personRecordId
      }
      // Deals typically don't use a matching_attribute (always create new)
      const result = await upsertWithRetry(apiKey, 'deals', dealValues, 'name')
      results.deal = {
        record_id: result.recordId,
        object_slug: 'deals',
        attio_url: buildAttioUrl(workspaceSlug, 'deals', result.recordId),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deal creation failed'
      return NextResponse.json(
        { error: msg, results, partial: true },
        { status: 502 }
      )
    }
  }

  return NextResponse.json({ results })
}
