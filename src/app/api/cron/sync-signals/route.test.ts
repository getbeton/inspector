/// <reference types="vitest" />
import { GET } from './route'

/**
 * Tests for GET /api/cron/sync-signals — focused on the HubSpot sync branch.
 *
 * Verifies that an auto-update target of type `hubspot` resolves HubSpot
 * credentials, ensures the beton_* properties exist, and upserts a contact per
 * matched distinct_id (email) — mirroring the existing Attio list branch.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/middleware/cron-auth', () => ({
  verifyCronAuth: vi.fn(() => true),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/integrations/credentials', () => ({
  getIntegrationCredentialsAdmin: vi.fn(),
}))

vi.mock('@/lib/integrations/posthog/regions', () => ({
  getPostHogHost: vi.fn(() => 'https://us.posthog.com'),
}))

vi.mock('@/lib/integrations/posthog/client', () => ({
  PostHogClient: vi.fn(),
}))

vi.mock('@/lib/integrations/attio/client', () => ({
  upsertPersonRecords: vi.fn(),
  syncListEntries: vi.fn(),
}))

vi.mock('@/lib/integrations/hubspot', () => ({
  createHubSpotClientForWorkspace: vi.fn(),
  ensureBetonProperties: vi.fn(),
  upsertContact: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import {
  createHubSpotClientForWorkspace,
  ensureBetonProperties,
  upsertContact,
} from '@/lib/integrations/hubspot'

const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>
const mockGetCreds = getIntegrationCredentialsAdmin as ReturnType<typeof vi.fn>
const mockPostHogClient = PostHogClient as unknown as ReturnType<typeof vi.fn>
const mockCreateHubSpotClient = createHubSpotClientForWorkspace as ReturnType<typeof vi.fn>
const mockEnsureBetonProperties = ensureBetonProperties as ReturnType<typeof vi.fn>
const mockUpsertContact = upsertContact as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal chainable supabase stub: `.from().select().eq()` resolves to the
 * configured sync configs; `.update().eq()` is a no-op. Mirrors the `as any`
 * client the route uses.
 */
function makeSupabaseStub(configs: unknown[]) {
  const updateChain = { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: configs, error: null }),
      })),
      update: vi.fn(() => updateChain),
    })),
  }
}

function makeRequest() {
  return new Request('https://example.com/api/cron/sync-signals')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/sync-signals — hubspot target', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockPostHogClient.mockImplementation(function PostHogClientStub() {
      return {
        query: vi.fn().mockResolvedValue({
          results: [['alice@example.com'], ['bob@example.com']],
        }),
        updateStaticCohort: vi.fn(),
      }
    })

    mockCreateHubSpotClient.mockResolvedValue({ __hubspotClient: true })
    mockEnsureBetonProperties.mockResolvedValue({ created: [], skipped: [], errors: [] })
    mockUpsertContact.mockResolvedValue({ recordId: '1', action: 'created', objectType: 'contacts' })
  })

  it('upserts a contact per matched email through the HubSpot branch', async () => {
    const configs = [
      {
        id: 'cfg-1',
        signal_definition_id: 'sig-1',
        workspace_id: 'ws-1',
        event_names: ['pageview'],
        condition_operator: 'gte',
        condition_value: 1,
        time_window_days: 7,
        signal_sync_targets: [
          {
            id: 'tgt-1',
            target_type: 'hubspot',
            external_id: 'contacts',
            auto_update: true,
          },
        ],
      },
    ]

    mockCreateAdminClient.mockReturnValue(makeSupabaseStub(configs))
    // PostHog creds for the query, HubSpot creds for the write.
    mockGetCreds.mockImplementation(async (_ws: string, name: string) => {
      if (name === 'posthog') return { apiKey: 'ph-key', projectId: '1', region: 'us' }
      if (name === 'hubspot') return { apiKey: 'hs-token', isActive: true }
      return null
    })

    const res = await GET(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.synced).toBe(1)
    expect(mockCreateHubSpotClient).toHaveBeenCalledWith('ws-1')
    expect(mockEnsureBetonProperties).toHaveBeenCalledWith({ __hubspotClient: true }, 'contacts')
    expect(mockUpsertContact).toHaveBeenCalledTimes(2)
    expect(mockUpsertContact).toHaveBeenCalledWith(
      { __hubspotClient: true },
      expect.objectContaining({ email: 'alice@example.com' }),
    )
  })

  it('skips the HubSpot write when HubSpot is not connected', async () => {
    const configs = [
      {
        id: 'cfg-1',
        signal_definition_id: 'sig-1',
        workspace_id: 'ws-1',
        event_names: ['pageview'],
        condition_operator: 'gte',
        condition_value: 1,
        time_window_days: 7,
        signal_sync_targets: [
          { id: 'tgt-1', target_type: 'hubspot', external_id: 'contacts', auto_update: true },
        ],
      },
    ]

    mockCreateAdminClient.mockReturnValue(makeSupabaseStub(configs))
    mockGetCreds.mockImplementation(async (_ws: string, name: string) => {
      if (name === 'posthog') return { apiKey: 'ph-key', projectId: '1', region: 'us' }
      return null // hubspot not connected
    })

    const res = await GET(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.synced).toBe(1)
    expect(mockCreateHubSpotClient).not.toHaveBeenCalled()
    expect(mockUpsertContact).not.toHaveBeenCalled()
  })
})
