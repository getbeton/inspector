/// <reference types="vitest" />
/**
 * Tests for POST /api/cron/hubspot-sync
 *
 * HS-S01: Unauthorized without CRON_SECRET
 * HS-S02: No connections returns success with 0 processed
 * HS-S03: Syncs active connections
 * HS-S04: Handles connection sync errors gracefully
 * HS-S06: Returns summary with per-connection results
 * HS-S07: Handles DB fetch failure
 */

import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockVerifyCronAuth = vi.fn().mockReturnValue(true)
const mockConnections = vi.fn()
const mockSyncConnection = vi.fn()

vi.mock('@/lib/middleware/cron-auth', () => ({
  verifyCronAuth: (...args: unknown[]) => mockVerifyCronAuth(...args),
}))

vi.mock('@/lib/supabase/admin', () => {
  const chainMock = () => {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockImplementation(() => mockConnections()),
          }),
        }),
      }),
    }
  }
  return {
    createAdminClient: vi.fn().mockReturnValue({
      from: vi.fn().mockImplementation(() => chainMock()),
    }),
  }
})

vi.mock('@/lib/integrations/hubspot/polling', () => ({
  syncConnection: (...args: unknown[]) => mockSyncConnection(...args),
}))

vi.mock('@/lib/utils/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Import after mocks
import { POST } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest() {
  return new NextRequest('http://localhost:3000/api/cron/hubspot-sync', {
    method: 'POST',
    headers: { 'x-cron-secret': 'test-secret' },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/cron/hubspot-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyCronAuth.mockReturnValue(true)
    mockConnections.mockReturnValue({ data: [], error: null })
    mockSyncConnection.mockResolvedValue({
      connectionId: 'conn-1',
      hubId: '12345',
      results: [],
      totalRecordsSynced: 0,
      totalErrors: 0,
      durationMs: 100,
    })
  })

  // HS-S01: Unauthorized
  it('returns 401 when cron auth fails', async () => {
    mockVerifyCronAuth.mockReturnValue(false)
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  // HS-S02: No connections
  it('returns success with 0 processed when no connections', async () => {
    mockConnections.mockReturnValue({ data: [], error: null })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.summary.connections_processed).toBe(0)
  })

  // HS-S03: Syncs active connections
  it('syncs active connections and returns results', async () => {
    mockConnections.mockReturnValue({
      data: [
        { id: 'conn-1', workspace_id: 'ws-1', hub_id: '111', name: 'HS 1' },
        { id: 'conn-2', workspace_id: 'ws-2', hub_id: '222', name: 'HS 2' },
      ],
      error: null,
    })

    mockSyncConnection
      .mockResolvedValueOnce({
        connectionId: 'conn-1',
        hubId: '111',
        results: [{ objectType: 'contacts', recordsSynced: 50, status: 'success' }],
        totalRecordsSynced: 50,
        totalErrors: 0,
        durationMs: 500,
      })
      .mockResolvedValueOnce({
        connectionId: 'conn-2',
        hubId: '222',
        results: [{ objectType: 'contacts', recordsSynced: 30, status: 'success' }],
        totalRecordsSynced: 30,
        totalErrors: 0,
        durationMs: 300,
      })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.summary.connections_processed).toBe(2)
    expect(body.summary.total_records_synced).toBe(80)
    expect(body.summary.total_errors).toBe(0)
    expect(mockSyncConnection).toHaveBeenCalledTimes(2)
  })

  // HS-S04: Handles sync errors gracefully
  it('handles connection sync errors gracefully', async () => {
    mockConnections.mockReturnValue({
      data: [
        { id: 'conn-fail', workspace_id: 'ws-1', hub_id: '111', name: 'HS Fail' },
      ],
      error: null,
    })

    mockSyncConnection.mockRejectedValue(new Error('Sync failed'))

    const res = await POST(makeRequest())
    expect(res.status).toBe(200) // Job itself succeeds

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.summary.total_errors).toBe(1)
  })

  // HS-S06: Returns summary
  it('includes per-connection results in response', async () => {
    mockConnections.mockReturnValue({
      data: [
        { id: 'conn-1', workspace_id: 'ws-1', hub_id: '111', name: 'HS 1' },
      ],
      error: null,
    })

    mockSyncConnection.mockResolvedValue({
      connectionId: 'conn-1',
      hubId: '111',
      results: [
        { objectType: 'contacts', recordsSynced: 25, status: 'success', durationMs: 200 },
        { objectType: 'companies', recordsSynced: 10, status: 'success', durationMs: 150 },
      ],
      totalRecordsSynced: 35,
      totalErrors: 0,
      durationMs: 350,
    })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(body.connections).toHaveLength(1)
    expect(body.connections[0].objects).toHaveLength(2)
    expect(body.connections[0].records_synced).toBe(35)
  })

  // HS-S07: DB fetch failure
  it('returns 500 when DB fetch fails', async () => {
    mockConnections.mockReturnValue({
      data: null,
      error: { message: 'Database error' },
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
  })
})
