import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Tests for POST /api/agent/hubspot/associations/batch
 * HS-A16 through HS-A18
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
  getHubSpotConnectionCredentialsAdmin: vi.fn(),
}));

vi.mock('@/lib/integrations/hubspot/client', () => ({
  createHubSpotClient: vi.fn(),
}));

vi.mock('@/lib/integrations/hubspot/associations', () => ({
  batchCreateAssociations: vi.fn(),
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
import {
  resolveHubSpotConnectionAdmin,
  getHubSpotConnectionCredentialsAdmin,
} from '@/lib/integrations/hubspot/config';
import { createHubSpotClient } from '@/lib/integrations/hubspot/client';
import { batchCreateAssociations } from '@/lib/integrations/hubspot/associations';

const mockValidate = validateAgentRequest as ReturnType<typeof vi.fn>;
const mockResolveSession = resolveSession as ReturnType<typeof vi.fn>;
const mockRateLimitResponse = rateLimitResponse as ReturnType<typeof vi.fn>;
const mockResolveConnection = resolveHubSpotConnectionAdmin as ReturnType<typeof vi.fn>;
const mockGetCredentials = getHubSpotConnectionCredentialsAdmin as ReturnType<typeof vi.fn>;
const mockCreateClient = createHubSpotClient as ReturnType<typeof vi.fn>;
const mockBatchAssociations = batchCreateAssociations as ReturnType<typeof vi.fn>;

const TEST_WORKSPACE_ID = 'ws-assoc-test';
const TEST_CREDENTIALS = {
  token: 'test-token',
  authType: 'private_app' as const,
  connectionId: 'conn-1',
  connectionName: 'Test',
  refreshToken: null,
  tokenExpiresAt: null,
  hubId: '12345',
  isActive: true,
  status: 'connected',
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/agent/hubspot/associations/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agent/hubspot/associations/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue(true);
    mockRateLimitResponse.mockReturnValue(null);
    mockResolveSession.mockResolvedValue({
      workspaceId: TEST_WORKSPACE_ID,
      status: 'running',
      sessionUUID: 'uuid-1',
    });
    mockResolveConnection.mockResolvedValue({
      id: 'conn-1',
      workspace_id: TEST_WORKSPACE_ID,
    });
    mockGetCredentials.mockResolvedValue(TEST_CREDENTIALS);
    mockCreateClient.mockReturnValue({});
  });

  // HS-A16: Batch 5 associations -> success
  it('HS-A16: batch creates 5 associations successfully', async () => {
    mockBatchAssociations.mockResolvedValue({ succeeded: 5, failed: 0 });

    const associations = Array.from({ length: 5 }, (_, i) => ({
      from_type: 'contacts',
      from_id: `cont-${i}`,
      to_type: 'companies',
      to_id: `comp-${i}`,
    }));

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        associations,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.succeeded).toBe(5);
    expect(data.failed).toBe(0);

    // Verify the input was mapped correctly
    expect(mockBatchAssociations).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          fromType: 'contacts',
          fromId: 'cont-0',
          toType: 'companies',
          toId: 'comp-0',
        }),
      ])
    );
  });

  // HS-A17: Exceeds 2000 limit
  it('HS-A17: returns 400 when exceeding 2000 associations', async () => {
    const associations = Array.from({ length: 2001 }, (_, i) => ({
      from_type: 'contacts',
      from_id: `cont-${i}`,
      to_type: 'companies',
      to_id: `comp-${i}`,
    }));

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        associations,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Maximum 2000');
  });

  // HS-A18: Mixed association types -> groups by pair
  it('HS-A18: handles mixed association types', async () => {
    mockBatchAssociations.mockResolvedValue({ succeeded: 3, failed: 0 });

    const associations = [
      { from_type: 'contacts', from_id: 'c1', to_type: 'companies', to_id: 'co1' },
      { from_type: 'deals', from_id: 'd1', to_type: 'contacts', to_id: 'c1' },
      { from_type: 'deals', from_id: 'd1', to_type: 'companies', to_id: 'co1' },
    ];

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        associations,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.succeeded).toBe(3);

    // Verify batchCreateAssociations received all 3 inputs
    const passedInputs = mockBatchAssociations.mock.calls[0][1];
    expect(passedInputs).toHaveLength(3);
  });

  it('returns 400 for empty associations array', async () => {
    const res = await POST(
      makeRequest({ session_id: 'sess-1', associations: [] })
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthorized', async () => {
    mockValidate.mockReturnValue(false);

    const res = await POST(
      makeRequest({ session_id: 'sess-1', associations: [{}] })
    );

    expect(res.status).toBe(401);
  });
});
