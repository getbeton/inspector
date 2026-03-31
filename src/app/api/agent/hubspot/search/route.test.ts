import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Tests for POST /api/agent/hubspot/search
 * HS-A01 through HS-A07
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

const mockValidate = validateAgentRequest as ReturnType<typeof vi.fn>;
const mockResolveSession = resolveSession as ReturnType<typeof vi.fn>;
const mockRateLimitResponse = rateLimitResponse as ReturnType<typeof vi.fn>;
const mockResolveConnection = resolveHubSpotConnectionAdmin as ReturnType<typeof vi.fn>;
const mockGetCredentials = getHubSpotConnectionCredentialsAdmin as ReturnType<typeof vi.fn>;
const mockCreateClient = createHubSpotClient as ReturnType<typeof vi.fn>;

const TEST_WORKSPACE_ID = 'ws-test-123';
const TEST_CONNECTION = {
  id: 'conn-1',
  workspace_id: TEST_WORKSPACE_ID,
  is_active: true,
  hub_id: '12345',
};
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
  return new NextRequest('http://localhost:3000/api/agent/hubspot/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agent/hubspot/search', () => {
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
    mockGetCredentials.mockResolvedValue(TEST_CREDENTIALS);
  });

  // HS-A01: Agent search contacts with valid session and filters
  it('HS-A01: returns search results with filters', async () => {
    const mockSearch = vi.fn().mockResolvedValue({
      total: 2,
      results: [
        { id: '101', properties: { email: 'a@test.com', firstname: 'Alice' } },
        { id: '102', properties: { email: 'b@test.com', firstname: 'Bob' } },
      ],
    });
    mockCreateClient.mockReturnValue({ search: mockSearch });

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        object_type: 'contacts',
        filters: [{ filters: [{ propertyName: 'email', operator: 'CONTAINS_TOKEN', value: 'test.com' }] }],
        properties: ['email', 'firstname'],
        limit: 10,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(2);
    expect(data.results).toHaveLength(2);
    expect(mockSearch).toHaveBeenCalledWith('contacts', expect.objectContaining({
      properties: ['email', 'firstname'],
      limit: 10,
    }));
  });

  // HS-A02: Auto-connection selection when no connection_id
  it('HS-A02: auto-selects first active connection', async () => {
    const mockSearch = vi.fn().mockResolvedValue({ total: 0, results: [] });
    mockCreateClient.mockReturnValue({ search: mockSearch });

    await POST(makeRequest({ session_id: 'sess-1', object_type: 'contacts' }));

    expect(mockResolveConnection).toHaveBeenCalledWith(TEST_WORKSPACE_ID, undefined);
  });

  // HS-A03: Explicit connection_id
  it('HS-A03: uses specified connection_id', async () => {
    const mockSearch = vi.fn().mockResolvedValue({ total: 0, results: [] });
    mockCreateClient.mockReturnValue({ search: mockSearch });

    await POST(
      makeRequest({ session_id: 'sess-1', object_type: 'contacts', connection_id: 'conn-explicit' })
    );

    expect(mockResolveConnection).toHaveBeenCalledWith(TEST_WORKSPACE_ID, 'conn-explicit');
  });

  // HS-A04: No active connection
  it('HS-A04: returns 404 when no active connection', async () => {
    mockResolveConnection.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ session_id: 'sess-1', object_type: 'contacts' })
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('No active HubSpot connection');
  });

  // HS-A05: Invalid session
  it('HS-A05: returns 404 when session is invalid', async () => {
    mockResolveSession.mockRejectedValue(new Error('Session not found'));

    const res = await POST(
      makeRequest({ session_id: 'bad-sess', object_type: 'contacts' })
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Session not found');
  });

  // HS-A06: Unauthorized
  it('HS-A06: returns 401 when unauthorized', async () => {
    mockValidate.mockReturnValue(false);

    const res = await POST(
      makeRequest({ session_id: 'sess-1', object_type: 'contacts' })
    );

    expect(res.status).toBe(401);
  });

  // HS-A07: Cross-workspace isolation
  it('HS-A07: returns 404 when connection belongs to different workspace', async () => {
    mockResolveConnection.mockResolvedValue(null); // Admin resolver checks workspace_id

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        object_type: 'contacts',
        connection_id: 'conn-other-workspace',
      })
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid object_type', async () => {
    const res = await POST(
      makeRequest({ session_id: 'sess-1', object_type: 'invalid_type' })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid object_type');
  });

  it('returns 400 when session_id is missing', async () => {
    const res = await POST(makeRequest({ object_type: 'contacts' }));
    expect(res.status).toBe(400);
  });
});
