import { NextRequest } from 'next/server';
import { POST, GET } from './route';

/**
 * Tests for GET/POST /api/agent/hubspot/sync
 * HS-A19 through HS-A22
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/agent/auth', () => ({
  validateAgentRequest: vi.fn(),
}));

vi.mock('@/lib/agent/session', () => ({
  resolveSession: vi.fn(),
}));

vi.mock('@/lib/agent/rate-limit', () => ({
  rateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/integrations/hubspot/config', () => ({
  resolveHubSpotConnectionAdmin: vi.fn(),
}));

vi.mock('@/lib/integrations/hubspot/polling', () => ({
  syncObjectType: vi.fn(),
}));

vi.mock('@/lib/integrations/hubspot/client', () => ({
  createHubSpotClientForConnection: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { validateAgentRequest } from '@/lib/agent/auth';
import { resolveSession } from '@/lib/agent/session';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import { resolveHubSpotConnectionAdmin } from '@/lib/integrations/hubspot/config';
import { syncObjectType } from '@/lib/integrations/hubspot/polling';
import { createHubSpotClientForConnection } from '@/lib/integrations/hubspot/client';
import { createAdminClient } from '@/lib/supabase/admin';

const mockValidate = validateAgentRequest as ReturnType<typeof vi.fn>;
const mockResolveSession = resolveSession as ReturnType<typeof vi.fn>;
const mockRateLimitResponse = rateLimitResponse as ReturnType<typeof vi.fn>;
const mockResolveConnection = resolveHubSpotConnectionAdmin as ReturnType<typeof vi.fn>;
const mockSyncObjectType = syncObjectType as ReturnType<typeof vi.fn>;
const mockCreateClientForConnection = createHubSpotClientForConnection as ReturnType<typeof vi.fn>;
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

const TEST_WORKSPACE_ID = 'ws-sync-test';
const TEST_CONNECTION = {
  id: 'conn-1',
  workspace_id: TEST_WORKSPACE_ID,
  hub_id: '12345',
};

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/agent/hubspot/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(params: Record<string, string>) {
  const url = new URL('http://localhost:3000/api/agent/hubspot/sync');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agent/hubspot/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue(true);
    mockRateLimitResponse.mockReturnValue(null);
    mockResolveSession.mockResolvedValue({
      workspaceId: TEST_WORKSPACE_ID,
      status: 'running',
      sessionUUID: 'uuid-1',
    });
    mockResolveConnection.mockResolvedValue(TEST_CONNECTION);

    // Default: no sync currently running
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    });
    mockCreateAdminClient.mockReturnValue({ from: mockFrom });
    mockCreateClientForConnection.mockResolvedValue({});
  });

  // HS-A19: Trigger manual sync
  it('HS-A19: triggers manual sync for all object types', async () => {
    mockSyncObjectType.mockResolvedValue({
      objectType: 'contacts',
      recordsSynced: 10,
      status: 'success',
      durationMs: 1000,
    });

    const res = await POST(
      makePostRequest({ session_id: 'sess-1' })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('initiated');
    expect(data.results).toBeDefined();
    // 4 standard types
    expect(mockSyncObjectType).toHaveBeenCalledTimes(4);
  });

  // HS-A20: Already running -> 409
  it('HS-A20: returns 409 when sync is already running', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ object_type: 'contacts', status: 'syncing' }],
            }),
          }),
        }),
      }),
    });
    mockCreateAdminClient.mockReturnValue({ from: mockFrom });

    const res = await POST(
      makePostRequest({ session_id: 'sess-1' })
    );

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('already in progress');
  });
});

describe('GET /api/agent/hubspot/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue(true);
    mockRateLimitResponse.mockReturnValue(null);
    mockResolveSession.mockResolvedValue({
      workspaceId: TEST_WORKSPACE_ID,
      status: 'running',
      sessionUUID: 'uuid-1',
    });
    mockResolveConnection.mockResolvedValue(TEST_CONNECTION);
  });

  // HS-A21: Get sync status
  it('HS-A21: returns per-object sync state', async () => {
    const syncStates = [
      { object_type: 'contacts', status: 'idle', last_sync_at: '2026-03-30T00:00:00Z', records_synced: 150, last_error: null },
      { object_type: 'companies', status: 'idle', last_sync_at: '2026-03-30T00:00:00Z', records_synced: 50, last_error: null },
      { object_type: 'deals', status: 'error', last_sync_at: null, records_synced: 0, last_error: 'Rate limited' },
    ];

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: syncStates, error: null }),
        }),
      }),
    });
    mockCreateAdminClient.mockReturnValue({ from: mockFrom });

    const res = await GET(
      makeGetRequest({ session_id: 'sess-1' })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.connection_id).toBe('conn-1');
    expect(data.sync_states).toHaveLength(3);
    expect(data.sync_states[0].object_type).toBe('contacts');
  });
});

describe('GET /api/agent/hubspot/connections (via sync route)', () => {
  // HS-A22 is tested implicitly through the connections endpoint
  it('returns 401 when unauthorized', async () => {
    mockValidate.mockReturnValue(false);
    const res = await GET(makeGetRequest({ session_id: 'sess-1' }));
    expect(res.status).toBe(401);
  });
});
