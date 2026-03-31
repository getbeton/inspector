/// <reference types="vitest" />
/**
 * Tests for GET /api/integrations/hubspot/search
 *
 * HS-I18: Successful search returns results
 * HS-I19: Email query uses CONTAINS_TOKEN filter
 * HS-I20: Missing connection_id returns 400
 * HS-I21: Not authenticated returns 401
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn()
const mockGetWorkspaceMembership = vi.fn()
const mockSearch = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'conn-1', workspace_id: 'ws-1' },
              error: null,
            }),
          }),
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/supabase/helpers', () => ({
  getWorkspaceMembership: () => mockGetWorkspaceMembership(),
}))

vi.mock('@/lib/integrations/hubspot/config', () => ({
  getHubSpotConnectionCredentials: vi.fn().mockResolvedValue({
    token: 'pat-test-token',
    authType: 'private_app',
  }),
}))

vi.mock('@/lib/integrations/hubspot/client', () => {
  return {
    HubSpotClient: class MockHubSpotClient {
      search = mockSearch
    },
  }
})

vi.mock('@/lib/utils/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Import after mocks
import { GET } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSearchRequest(params: Record<string, string>) {
  const url = new URL('http://localhost:3000/api/integrations/hubspot/search')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url.toString())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/integrations/hubspot/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetWorkspaceMembership.mockResolvedValue({
      workspaceId: 'ws-1',
      userId: 'user-1',
      role: 'owner',
    })
    mockSearch.mockResolvedValue({
      total: 1,
      results: [{ id: '1', properties: { email: 'test@example.com' } }],
    })
  })

  // HS-I21: Not authenticated
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(
      makeSearchRequest({ connection_id: 'conn-1', q: 'test' })
    )
    expect(res.status).toBe(401)
  })

  // HS-I20: Missing connection_id
  it('returns 400 when connection_id is missing', async () => {
    const res = await GET(makeSearchRequest({ q: 'test' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('connection_id')
  })

  // Missing query
  it('returns 400 when q is missing', async () => {
    const res = await GET(makeSearchRequest({ connection_id: 'conn-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('q')
  })

  // HS-I18: Successful search
  it('returns search results', async () => {
    const res = await GET(
      makeSearchRequest({ connection_id: 'conn-1', q: 'John' })
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.results).toHaveLength(1)
  })

  // HS-I18: Full-text search passes query
  it('uses full-text query for non-email searches', async () => {
    await GET(
      makeSearchRequest({ connection_id: 'conn-1', q: 'Acme Corp' })
    )

    expect(mockSearch).toHaveBeenCalled()
    const searchCall = mockSearch.mock.calls[0]
    const [objectType, searchOptions] = searchCall
    expect(objectType).toBe('contacts')
    expect(searchOptions.query).toBe('Acme Corp')
  })

  // HS-I19: Email query uses CONTAINS_TOKEN filter
  it('uses CONTAINS_TOKEN filter for email queries', async () => {
    await GET(
      makeSearchRequest({ connection_id: 'conn-1', q: 'test@example.com' })
    )

    expect(mockSearch).toHaveBeenCalled()
    const [, searchOptions] = mockSearch.mock.calls[0]
    expect(searchOptions.filterGroups).toBeDefined()
    expect(searchOptions.filterGroups[0].filters[0].operator).toBe('CONTAINS_TOKEN')
    expect(searchOptions.filterGroups[0].filters[0].value).toBe('test@example.com')
  })

  // Default object type
  it('defaults to contacts object type', async () => {
    await GET(
      makeSearchRequest({ connection_id: 'conn-1', q: 'test' })
    )

    const [objectType] = mockSearch.mock.calls[0]
    expect(objectType).toBe('contacts')
  })

  // Custom object type
  it('accepts custom object_type', async () => {
    await GET(
      makeSearchRequest({
        connection_id: 'conn-1',
        q: 'test',
        object_type: 'companies',
      })
    )

    const [objectType] = mockSearch.mock.calls[0]
    expect(objectType).toBe('companies')
  })
})
