/// <reference types="vitest" />
/**
 * Tests for POST /api/integrations/hubspot/validate
 *
 * HS-I09: Valid Private App token → connection created
 * HS-I10: Invalid token format → 400
 * HS-I11: Token fails connection test → 401
 * HS-I12: Not authenticated → 401
 * HS-I13: PATCH updates config
 */

import { NextRequest } from 'next/server'
import { POST, PATCH } from './route'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn()
const mockGetWorkspaceMembership = vi.fn()
const mockUpsert = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn().mockReturnValue({
      upsert: mockUpsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'conn-1', hub_id: '12345' },
            error: null,
          }),
        }),
      }),
      update: mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/supabase/helpers', () => ({
  getWorkspaceMembership: () => mockGetWorkspaceMembership(),
}))

vi.mock('@/lib/crypto/encryption', () => ({
  encrypt: vi.fn().mockResolvedValue('encrypted-token'),
}))

vi.mock('@/lib/utils/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/lib/utils/api-rate-limit', () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
  RATE_LIMITS: {
    VALIDATION: { limit: 10, windowSeconds: 60 },
  },
}))

// Mock fetch for HubSpot API calls
const originalFetch = global.fetch

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>, method = 'POST') {
  return new NextRequest('http://localhost:3000/api/integrations/hubspot/validate', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/integrations/hubspot/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetWorkspaceMembership.mockResolvedValue({
      workspaceId: 'ws-1',
      userId: 'user-1',
      role: 'owner',
    })

    // Mock successful HubSpot API response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          portalId: 12345,
          uiDomain: 'app.hubspot.com',
          accountType: 'STANDARD',
        }),
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // HS-I12: Not authenticated
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ token: 'pat-na1-test1234567890' }))
    expect(res.status).toBe(401)
  })

  // No workspace
  it('returns 404 when no workspace found', async () => {
    mockGetWorkspaceMembership.mockResolvedValue(null)
    const res = await POST(makeRequest({ token: 'pat-na1-test1234567890' }))
    expect(res.status).toBe(404)
  })

  // HS-I10: Invalid token format
  it('returns 400 for token without pat- prefix', async () => {
    const res = await POST(makeRequest({ token: 'sk-invalid-token-here' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('invalid_token')
  })

  it('returns 400 for empty token', async () => {
    const res = await POST(makeRequest({ token: '' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns 400 for too short token', async () => {
    const res = await POST(makeRequest({ token: 'pat-short' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_token')
  })

  // HS-I11: Token fails connection test
  it('returns 401 when HubSpot API rejects token', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    })

    const res = await POST(makeRequest({ token: 'pat-na1-valid-but-rejected1234' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('connection_failed')
  })

  // HS-I09: Valid token → connection created
  it('creates connection for valid token', async () => {
    const res = await POST(
      makeRequest({ token: 'pat-na1-valid1234567890abcdef', name: 'My HubSpot' })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.connection_id).toBe('conn-1')
    expect(body.hub_id).toBe('12345')
  })

  it('uses default name when none provided', async () => {
    const res = await POST(makeRequest({ token: 'pat-na1-valid1234567890abcdef' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

describe('PATCH /api/integrations/hubspot/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetWorkspaceMembership.mockResolvedValue({
      workspaceId: 'ws-1',
      userId: 'user-1',
      role: 'owner',
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(
      makeRequest({ connection_id: 'conn-1', config: { enabled_objects: ['contacts'] } })
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 when connection_id is missing', async () => {
    const res = await PATCH(
      makeRequest({ config: { enabled_objects: ['contacts'] } })
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when config is missing', async () => {
    const res = await PATCH(makeRequest({ connection_id: 'conn-1' }))
    expect(res.status).toBe(400)
  })

  // HS-I13: Successful config update
  it('updates connection config', async () => {
    const res = await PATCH(
      makeRequest({
        connection_id: 'conn-1',
        config: { enabled_objects: ['contacts', 'companies'] },
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})
