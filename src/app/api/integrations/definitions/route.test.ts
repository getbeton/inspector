/// <reference types="vitest" />
import { GET } from './route'

/**
 * Tests for GET /api/integrations/definitions
 *
 * BETON-277 TC3: API returns definitions with connection status
 * BETON-277 TC4: API rejects unauthenticated requests
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  requireWorkspace: vi.fn(),
  createClient: vi.fn(),
}))

import { requireWorkspace, createClient } from '@/lib/supabase/server'

const mockRequireWorkspace = requireWorkspace as ReturnType<typeof vi.fn>
const mockCreateClient = createClient as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFINITIONS = [
  {
    id: 'def-1',
    name: 'posthog',
    display_name: 'PostHog',
    description: 'Product analytics',
    category: 'data_source',
    icon_url: 'https://cdn.example.com/posthog.svg',
    icon_url_light: null,
    required: true,
    display_order: 10,
    setup_step_key: 'posthog',
    supports_self_hosted: true,
    config_schema: null,
  },
  {
    id: 'def-2',
    name: 'attio',
    display_name: 'Attio',
    description: 'CRM',
    category: 'crm',
    icon_url: 'https://cdn.example.com/attio.svg',
    icon_url_light: null,
    required: true,
    display_order: 20,
    setup_step_key: 'attio',
    supports_self_hosted: false,
    config_schema: null,
  },
  {
    id: 'def-3',
    name: 'firecrawl',
    display_name: 'Firecrawl',
    description: 'Web scraping',
    category: 'web_scraping',
    icon_url: null,
    icon_url_light: null,
    required: false,
    display_order: 60,
    setup_step_key: 'firecrawl',
    supports_self_hosted: true,
    config_schema: null,
  },
]

const CONFIGS = [
  {
    integration_name: 'posthog',
    status: 'connected',
    last_validated_at: '2026-02-22T10:00:00Z',
    is_active: true,
  },
]

function createSupabaseMock(options?: {
  definitionsData?: typeof DEFINITIONS | null
  definitionsError?: { message: string } | null
  configsData?: typeof CONFIGS | null
  configsError?: { message: string } | null
}) {
  const {
    definitionsData = DEFINITIONS,
    definitionsError = null,
    configsData = CONFIGS,
    configsError = null,
  } = options ?? {}

  // Definitions chain: from().select().order()
  const defChain = {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: definitionsData,
        error: definitionsError,
      }),
    }),
  }

  // Configs chain: from().select().eq()
  const configChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: configsData,
        error: configsError,
      }),
    }),
  }

  const fromMock = vi.fn((table: string) => {
    if (table === 'integration_definitions') return defChain
    if (table === 'integration_configs') return configChain
    return defChain // fallback
  })

  return { from: fromMock }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/integrations/definitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWorkspace.mockResolvedValue({ workspaceId: 'ws-1' })
  })

  // TC4: API rejects unauthenticated requests
  it('returns 401 when user is not authenticated', async () => {
    mockRequireWorkspace.mockRejectedValue(new Error('Unauthorized'))

    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Not authenticated' })
  })

  // TC4 extended: no workspace membership
  it('returns 404 when user has no workspace membership', async () => {
    mockRequireWorkspace.mockRejectedValue(new Error('No workspace found'))

    const res = await GET()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No workspace found' })
  })

  // TC3: API returns definitions with connection status
  it('returns enriched definitions with connection status', async () => {
    const supabase = createSupabaseMock()
    mockCreateClient.mockResolvedValue(supabase)

    const res = await GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.definitions).toHaveLength(3)

    // PostHog should be connected (matching config)
    const posthog = body.definitions.find(
      (d: { name: string }) => d.name === 'posthog'
    )
    expect(posthog.is_connected).toBe(true)
    expect(posthog.last_validated_at).toBe('2026-02-22T10:00:00Z')
    expect(posthog.required).toBe(true)

    // Attio should NOT be connected (no matching config)
    const attio = body.definitions.find(
      (d: { name: string }) => d.name === 'attio'
    )
    expect(attio.is_connected).toBe(false)
    expect(attio.last_validated_at).toBeNull()
    expect(attio.required).toBe(true)

    // Firecrawl should NOT be connected
    const firecrawl = body.definitions.find(
      (d: { name: string }) => d.name === 'firecrawl'
    )
    expect(firecrawl.is_connected).toBe(false)
    expect(firecrawl.required).toBe(false)
  })

  it('marks integration as disconnected when config is inactive', async () => {
    const inactiveConfig = [
      {
        integration_name: 'posthog',
        status: 'connected',
        last_validated_at: '2026-02-22T10:00:00Z',
        is_active: false, // inactive
      },
    ]
    const supabase = createSupabaseMock({ configsData: inactiveConfig })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await GET()
    const body = await res.json()

    const posthog = body.definitions.find(
      (d: { name: string }) => d.name === 'posthog'
    )
    expect(posthog.is_connected).toBe(false) // inactive config = not connected
  })

  it('marks integration as disconnected when config status is not "connected"', async () => {
    const failedConfig = [
      {
        integration_name: 'posthog',
        status: 'error',
        last_validated_at: '2026-02-22T10:00:00Z',
        is_active: true,
      },
    ]
    const supabase = createSupabaseMock({ configsData: failedConfig })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await GET()
    const body = await res.json()

    const posthog = body.definitions.find(
      (d: { name: string }) => d.name === 'posthog'
    )
    expect(posthog.is_connected).toBe(false) // status not "connected"
  })

  it('falls back to hardcoded definitions when definitions table is missing', async () => {
    const supabase = createSupabaseMock({
      definitionsData: null,
      definitionsError: { message: 'relation "integration_definitions" does not exist' },
    })
    mockCreateClient.mockResolvedValue(supabase)

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    // Should return the 3 hardcoded fallback definitions
    expect(body.definitions).toHaveLength(3)
    const names = body.definitions.map((d: { name: string }) => d.name)
    expect(names).toEqual(['posthog', 'attio', 'firecrawl'])
    consoleSpy.mockRestore()
  })

  it('returns 200 with no connections when configs query fails', async () => {
    const supabase = createSupabaseMock({
      configsData: null,
      configsError: { message: 'DB error' },
    })
    mockCreateClient.mockResolvedValue(supabase)

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    // All definitions present but none connected
    expect(body.definitions.every((d: { is_connected: boolean }) => !d.is_connected)).toBe(true)
    consoleSpy.mockRestore()
  })

  it('handles workspace with no configs gracefully', async () => {
    const supabase = createSupabaseMock({ configsData: [] })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.definitions).toHaveLength(3)
    // All should be disconnected
    expect(body.definitions.every((d: { is_connected: boolean }) => !d.is_connected)).toBe(true)
  })
})
