/// <reference types="vitest" />
/**
 * Tests for POST /api/integrations/hubspot/entities
 *
 * HS-I01: Single company creation returns record ID and URL
 * HS-I02: Batch chain creates company -> contact -> deal
 * HS-I03: Returns 401 when not authenticated
 * HS-I04: Returns 400 when no HubSpot connection found
 * HS-I05: Returns 400 for invalid object_type
 * HS-I06: Returns 400 when company_data missing for create_company
 * HS-I07: Returns 502 on HubSpot API failure (partial batch)
 * HS-I08: Returns 422 on validation error
 */

import { POST } from './route'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/utils/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const mockRequireWorkspace = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  requireWorkspace: () => mockRequireWorkspace(),
  createClient: () => ({}),
}))

const mockResolveConnection = vi.fn()
const mockGetCredentials = vi.fn()

vi.mock('@/lib/integrations/hubspot', () => ({
  resolveHubSpotConnection: (...args: unknown[]) => mockResolveConnection(...args),
  getHubSpotConnectionCredentials: (...args: unknown[]) => mockGetCredentials(...args),
  HubSpotRateLimitError: class extends Error { retryAfter = 10 },
  HubSpotValidationError: class extends Error {},
}))

const mockSearch = vi.fn()
const mockCreateRecord = vi.fn()
const mockUpdateRecord = vi.fn()
const mockCreateAssociationV4 = vi.fn()

vi.mock('@/lib/integrations/hubspot/client', () => {
  return {
    HubSpotClient: class MockHubSpotClient {
      search = mockSearch
      createRecord = mockCreateRecord
      updateRecord = mockUpdateRecord
      createAssociationV4 = mockCreateAssociationV4
    },
  }
})

vi.mock('@/lib/integrations/hubspot/associations', () => ({
  createAssociation: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/integrations/hubspot/entities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function setupAuth() {
  mockRequireWorkspace.mockResolvedValue({
    workspaceId: 'ws-1',
    user: { id: 'user-1' },
  })

  mockResolveConnection.mockResolvedValue({
    id: 'conn-1',
    workspace_id: 'ws-1',
    hub_id: '12345',
  })

  mockGetCredentials.mockResolvedValue({
    token: 'pat-test-token',
    authType: 'private_app',
    isActive: true,
    hubId: '12345',
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/integrations/hubspot/entities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('HS-I01: single company creation returns record ID and URL', async () => {
    setupAuth()
    mockSearch.mockResolvedValue({ results: [] })
    mockCreateRecord.mockResolvedValue({ id: 'company-1', properties: {} })

    const res = await POST(
      createRequest({
        object_type: 'companies',
        properties: { domain: 'acme.com', name: 'Acme Corp' },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.record_id).toBe('company-1')
    expect(data.object_type).toBe('companies')
    expect(data.hubspot_url).toContain('12345')
  })

  it('HS-I02: batch chain creates company -> contact -> deal', async () => {
    setupAuth()
    mockSearch.mockResolvedValue({ results: [] })
    mockCreateRecord
      .mockResolvedValueOnce({ id: 'company-1', properties: {} })
      .mockResolvedValueOnce({ id: 'contact-1', properties: {} })
      .mockResolvedValueOnce({ id: 'deal-1', properties: {} })

    const res = await POST(
      createRequest({
        create_company: true,
        company_data: { domain: 'acme.com', name: 'Acme Corp' },
        create_contact: true,
        contact_data: { email: 'user@acme.com' },
        create_deal: true,
        deal_data: { dealname: 'Acme -- Beton Signal' },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.results.company.record_id).toBe('company-1')
    expect(data.results.contact.record_id).toBe('contact-1')
    expect(data.results.deal.record_id).toBe('deal-1')
  })

  it('HS-I03: returns 401 when not authenticated', async () => {
    mockRequireWorkspace.mockRejectedValue(new Error('Unauthorized'))

    const res = await POST(
      createRequest({
        object_type: 'companies',
        properties: { domain: 'acme.com' },
      })
    )

    expect(res.status).toBe(401)
  })

  it('HS-I04: returns 400 when no HubSpot connection found', async () => {
    mockRequireWorkspace.mockResolvedValue({
      workspaceId: 'ws-1',
      user: { id: 'user-1' },
    })
    mockResolveConnection.mockResolvedValue(null)

    const res = await POST(
      createRequest({
        object_type: 'companies',
        properties: { domain: 'acme.com' },
      })
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('No HubSpot connection')
  })

  it('HS-I05: returns 400 for invalid object_type', async () => {
    setupAuth()

    const res = await POST(
      createRequest({
        object_type: 'invalid_type',
        properties: { domain: 'acme.com' },
      })
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid object_type')
  })

  it('HS-I06: returns 400 when company_data missing for create_company', async () => {
    setupAuth()

    const res = await POST(
      createRequest({
        create_company: true,
        // company_data intentionally missing
      })
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('company_data is required')
  })

  it('HS-I07: returns 502 on batch partial failure', async () => {
    setupAuth()
    mockSearch.mockResolvedValue({ results: [] })
    mockCreateRecord
      .mockResolvedValueOnce({ id: 'company-1', properties: {} })
      .mockRejectedValueOnce(new Error('Contact API error'))

    const res = await POST(
      createRequest({
        create_company: true,
        company_data: { domain: 'acme.com', name: 'Acme' },
        create_contact: true,
        contact_data: { email: 'user@acme.com' },
      })
    )

    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.partial).toBe(true)
    expect(data.results.company.record_id).toBe('company-1')
  })

  it('HS-I08: returns 404 for no workspace', async () => {
    mockRequireWorkspace.mockRejectedValue(new Error('No workspace found for user'))

    const res = await POST(
      createRequest({
        object_type: 'companies',
        properties: { domain: 'acme.com' },
      })
    )

    expect(res.status).toBe(404)
  })
})
