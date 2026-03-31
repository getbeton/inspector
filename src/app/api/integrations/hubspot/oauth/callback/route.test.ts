/// <reference types="vitest" />
/**
 * Tests for GET /api/integrations/hubspot/oauth/callback
 *
 * HS-I14: Successful OAuth callback exchanges code and stores tokens
 * HS-I15: Missing code/state returns error redirect
 * HS-I16: Invalid state returns error redirect
 * HS-I17: Token exchange failure returns error redirect
 */

import { GET } from './route'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn().mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      }),
      update: mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          // This returns void — no need to chain further
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/integrations/hubspot/auth', () => ({
  exchangeCodeForTokens: vi.fn(),
}))

vi.mock('@/lib/crypto/encryption', () => ({
  encrypt: vi.fn().mockResolvedValue('encrypted-value'),
}))

vi.mock('@/lib/utils/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { exchangeCodeForTokens } from '@/lib/integrations/hubspot/auth'

const mockExchangeCode = exchangeCodeForTokens as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCallbackRequest(params: Record<string, string>) {
  const url = new URL('http://localhost:3000/api/integrations/hubspot/oauth/callback')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url.toString())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/integrations/hubspot/oauth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  // HS-I15: Missing code/state
  it('redirects with error when code is missing', async () => {
    const res = await GET(makeCallbackRequest({ state: 'ws-1:token' }))
    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toContain('hubspot_error=')
    expect(location).toContain('Missing')
  })

  it('redirects with error when state is missing', async () => {
    const res = await GET(makeCallbackRequest({ code: 'auth-code' }))
    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toContain('hubspot_error=')
  })

  // HS-I16: Invalid state
  it('redirects with error for invalid state format', async () => {
    const res = await GET(makeCallbackRequest({ code: 'auth-code', state: 'invalid' }))
    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toContain('hubspot_error=')
    expect(location).toContain('Invalid%20state')
  })

  // HubSpot returns error
  it('redirects with HubSpot error when error param present', async () => {
    const res = await GET(
      makeCallbackRequest({
        error: 'access_denied',
        error_description: 'User denied access',
      })
    )
    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toContain('hubspot_error=User%20denied%20access')
  })

  // HS-I14: Not authenticated
  it('redirects with error when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await GET(
      makeCallbackRequest({ code: 'auth-code', state: 'ws-1:token123' })
    )
    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toContain('hubspot_error=Not%20authenticated')
  })

  // HS-I17: No matching pending connection
  it('redirects with error when no pending connection found', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })

    const res = await GET(
      makeCallbackRequest({ code: 'auth-code', state: 'ws-1:token123' })
    )
    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toContain('hubspot_error=')
    expect(location).toContain('expired')
  })

  // HS-I17: Token exchange failure
  it('redirects with error when token exchange fails', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'conn-1', workspace_id: 'ws-1' },
      error: null,
    })
    mockExchangeCode.mockRejectedValue(new Error('Token exchange failed'))

    // Need env vars for this path
    const originalClientId = process.env.HUBSPOT_CLIENT_ID
    const originalClientSecret = process.env.HUBSPOT_CLIENT_SECRET
    process.env.HUBSPOT_CLIENT_ID = 'test-client-id'
    process.env.HUBSPOT_CLIENT_SECRET = 'test-client-secret'

    const res = await GET(
      makeCallbackRequest({ code: 'bad-code', state: 'ws-1:token123' })
    )

    process.env.HUBSPOT_CLIENT_ID = originalClientId
    process.env.HUBSPOT_CLIENT_SECRET = originalClientSecret

    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toContain('hubspot_error=Token%20exchange%20failed')
  })

  // Missing env vars
  it('redirects with error when OAuth env vars missing', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'conn-1', workspace_id: 'ws-1' },
      error: null,
    })

    const originalClientId = process.env.HUBSPOT_CLIENT_ID
    const originalClientSecret = process.env.HUBSPOT_CLIENT_SECRET
    delete process.env.HUBSPOT_CLIENT_ID
    delete process.env.HUBSPOT_CLIENT_SECRET

    const res = await GET(
      makeCallbackRequest({ code: 'auth-code', state: 'ws-1:token123' })
    )

    process.env.HUBSPOT_CLIENT_ID = originalClientId
    process.env.HUBSPOT_CLIENT_SECRET = originalClientSecret

    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toContain('hubspot_error=')
    expect(location).toContain('not%20configured')
  })
})
