import { NextRequest } from 'next/server'
import { POST } from './route'

/**
 * Tests for POST /api/integrations/attio/entities
 *
 * BETON-280 TC1: Single entity creation — company
 * BETON-280 TC2: Upsert behavior — existing company
 * BETON-280 TC3: Batch creation — full chain
 * BETON-280 TC4: Batch creation — partial (person only)
 * BETON-280 TC5: Entity creation fails — auth error
 * BETON-280 TC6: Entity creation fails — rate limit
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  requireWorkspace: vi.fn(),
}))

vi.mock('@/lib/integrations/credentials', () => ({
  getIntegrationCredentials: vi.fn(),
}))

vi.mock('@/lib/integrations/attio/client', () => ({
  upsertRecord: vi.fn(),
  validateConnection: vi.fn(),
  AttioRateLimitError: class AttioRateLimitError extends Error {
    constructor(message = 'Rate limited') {
      super(message)
      this.name = 'AttioRateLimitError'
    }
  },
  AttioValidationError: class AttioValidationError extends Error {
    constructor(message = 'Validation error') {
      super(message)
      this.name = 'AttioValidationError'
    }
  },
}))

vi.mock('@/lib/utils/retry', () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => {
    try {
      const data = await fn()
      return { success: true, data }
    } catch (error) {
      return { success: false, lastError: error, error }
    }
  }),
}))

import { requireWorkspace } from '@/lib/supabase/server'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { upsertRecord, validateConnection } from '@/lib/integrations/attio/client'

const mockRequireWorkspace = requireWorkspace as ReturnType<typeof vi.fn>
const mockGetCreds = getIntegrationCredentials as ReturnType<typeof vi.fn>
const mockUpsertRecord = upsertRecord as ReturnType<typeof vi.fn>
const mockValidateConnection = validateConnection as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/integrations/attio/entities', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/integrations/attio/entities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWorkspace.mockResolvedValue({ workspaceId: 'ws-1' })
    mockGetCreds.mockResolvedValue({ apiKey: 'attio_test_key' })
    mockValidateConnection.mockResolvedValue({ workspaceName: 'Test Workspace' })
  })

  // Auth/workspace errors
  it('returns 401 when not authenticated', async () => {
    mockRequireWorkspace.mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(makeRequest({ object_slug: 'companies', attributes: {} }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when Attio is not configured', async () => {
    mockGetCreds.mockResolvedValue(null)
    const res = await POST(makeRequest({ object_slug: 'companies', attributes: {} }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Attio not configured' })
  })

  // TC1: Single entity creation
  it('creates a single company entity', async () => {
    mockUpsertRecord.mockResolvedValue({ recordId: 'rec-company-1' })

    const res = await POST(makeRequest({
      object_slug: 'companies',
      attributes: { name: [{ value: 'Test Corp' }], domains: [{ domain: 'test.com' }] },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.record_id).toBe('rec-company-1')
    expect(body.object_slug).toBe('companies')
    expect(body.attio_url).toContain('/companies/rec-company-1')
  })

  // TC1 extended: single person
  it('creates a single person entity with default matching', async () => {
    mockUpsertRecord.mockResolvedValue({ recordId: 'rec-person-1' })

    const res = await POST(makeRequest({
      object_slug: 'people',
      attributes: { email_addresses: [{ email_address: 'john@test.com' }] },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.record_id).toBe('rec-person-1')

    // Verify matching_attribute defaults to 'email_addresses' for people
    expect(mockUpsertRecord).toHaveBeenCalledWith(
      'attio_test_key',
      'people',
      expect.any(Object),
      'email_addresses'
    )
  })

  // Validation: invalid object slug
  it('rejects invalid object_slug', async () => {
    const res = await POST(makeRequest({
      object_slug: 'invalid',
      attributes: { name: 'test' },
    }))
    expect(res.status).toBe(400)
  })

  // Validation: missing attributes
  it('rejects request without attributes', async () => {
    const res = await POST(makeRequest({ object_slug: 'companies' }))
    expect(res.status).toBe(400)
  })

  // TC3: Batch creation — full chain
  it('creates company → person → deal chain in batch mode', async () => {
    let callCount = 0
    mockUpsertRecord.mockImplementation(async () => {
      callCount++
      return { recordId: `rec-${callCount}` }
    })

    const res = await POST(makeRequest({
      create_company: true,
      create_person: true,
      create_deal: true,
      company_data: { name: [{ value: 'Acme' }], domains: [{ domain: 'acme.com' }] },
      person_data: { email_addresses: [{ email_address: 'john@acme.com' }] },
      deal_data: { name: [{ value: 'Acme Deal' }] },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.results.company.record_id).toBe('rec-1')
    expect(body.results.person.record_id).toBe('rec-2')
    expect(body.results.deal.record_id).toBe('rec-3')

    // Verify person was linked to company
    expect(mockUpsertRecord).toHaveBeenCalledTimes(3)
    const personCall = mockUpsertRecord.mock.calls[1]
    expect(personCall[2]).toHaveProperty('company', 'rec-1')

    // Verify deal was linked to both company and person
    const dealCall = mockUpsertRecord.mock.calls[2]
    expect(dealCall[2]).toHaveProperty('company', 'rec-1')
    expect(dealCall[2]).toHaveProperty('person', 'rec-2')
  })

  // TC4: Batch creation — partial (person only)
  it('creates person without company link when company not requested', async () => {
    mockUpsertRecord.mockResolvedValue({ recordId: 'rec-person-solo' })

    const res = await POST(makeRequest({
      create_person: true,
      person_data: { email_addresses: [{ email_address: 'solo@test.com' }] },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.results.person.record_id).toBe('rec-person-solo')
    expect(body.results.company).toBeUndefined()

    // Person should NOT have company field
    const personCall = mockUpsertRecord.mock.calls[0]
    expect(personCall[2]).not.toHaveProperty('company')
  })

  // TC5: Entity creation fails — auth error (propagated as 502)
  it('returns 502 when company creation fails', async () => {
    mockUpsertRecord.mockRejectedValue(new Error('auth_error'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeRequest({
      create_company: true,
      company_data: { name: [{ value: 'Fail Corp' }] },
    }))

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe('auth_error')
    expect(body.partial).toBe(false) // company failure is non-partial
    consoleSpy.mockRestore()
  })

  // Partial failure: person fails after company succeeds
  it('returns 502 with partial=true when person fails after company', async () => {
    let callCount = 0
    mockUpsertRecord.mockImplementation(async () => {
      callCount++
      if (callCount === 2) throw new Error('Person creation failed')
      return { recordId: `rec-${callCount}` }
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeRequest({
      create_company: true,
      create_person: true,
      company_data: { domains: [{ domain: 'test.com' }] },
      person_data: { email_addresses: [{ email_address: 'fail@test.com' }] },
    }))

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.partial).toBe(true)
    expect(body.results.company.record_id).toBe('rec-1') // company succeeded
    consoleSpy.mockRestore()
  })

  // Workspace slug in URLs — _cachedSlug in the route means the first
  // validateConnection result ("Test Workspace") is reused across all tests
  it('includes workspace slug in attio_url', async () => {
    mockUpsertRecord.mockResolvedValue({ recordId: 'rec-url-test' })

    const res = await POST(makeRequest({
      object_slug: 'companies',
      attributes: { name: [{ value: 'URL Test' }] },
    }))

    const body = await res.json()
    // "Test Workspace" → "test-workspace" (lowercased, spaces to hyphens)
    expect(body.attio_url).toBe('https://app.attio.com/test-workspace/companies/rec-url-test')
  })
})
