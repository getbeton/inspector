import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Tests for POST /api/agent/hubspot/records/batch
 * HS-A08 through HS-A12
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
import { NextResponse } from 'next/server';

const mockValidate = validateAgentRequest as ReturnType<typeof vi.fn>;
const mockResolveSession = resolveSession as ReturnType<typeof vi.fn>;
const mockRateLimitResponse = rateLimitResponse as ReturnType<typeof vi.fn>;
const mockResolveConnection = resolveHubSpotConnectionAdmin as ReturnType<typeof vi.fn>;
const mockGetCredentials = getHubSpotConnectionCredentialsAdmin as ReturnType<typeof vi.fn>;
const mockCreateClient = createHubSpotClient as ReturnType<typeof vi.fn>;

const TEST_WORKSPACE_ID = 'ws-batch-test';
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
  return new NextRequest('http://localhost:3000/api/agent/hubspot/records/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agent/hubspot/records/batch', () => {
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
  });

  // HS-A08: Batch create companies (10 records -> 201)
  it('HS-A08: batch creates 10 companies successfully', async () => {
    let callCount = 0;
    const mockClient = {
      createRecord: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ id: `new-${callCount}`, properties: {} });
      }),
    };
    mockCreateClient.mockReturnValue(mockClient);

    const records = Array.from({ length: 10 }, (_, i) => ({
      properties: { name: `Company ${i}`, domain: `company${i}.com` },
    }));

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        object_type: 'companies',
        records,
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.summary.created).toBe(10);
    expect(data.summary.errors).toBe(0);
    expect(data.results).toHaveLength(10);
  });

  // HS-A09: Batch upsert with matching property
  it('HS-A09: reports created/updated with matching property', async () => {
    const mockClient = {
      search: vi.fn().mockImplementation((_type: string, opts: { filterGroups: Array<{ filters: Array<{ value: string }> }> }) => {
        // First record exists, second doesn't
        const email = opts.filterGroups[0].filters[0].value;
        if (email === 'existing@test.com') {
          return { results: [{ id: 'existing-1' }] };
        }
        return { results: [] };
      }),
      updateRecord: vi.fn().mockResolvedValue({ id: 'existing-1', properties: {} }),
      createRecord: vi.fn().mockResolvedValue({ id: 'new-1', properties: {} }),
    };
    mockCreateClient.mockReturnValue(mockClient);

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        object_type: 'contacts',
        records: [
          { properties: { email: 'existing@test.com', firstname: 'Exists' } },
          { properties: { email: 'new@test.com', firstname: 'New' } },
        ],
        matching_property: 'email',
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.summary.created).toBe(1);
    expect(data.summary.updated).toBe(1);
  });

  // HS-A10: Exceeds 100 record limit
  it('HS-A10: returns 400 when exceeding 100 records', async () => {
    const records = Array.from({ length: 101 }, (_, i) => ({
      properties: { name: `Company ${i}` },
    }));

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        object_type: 'companies',
        records,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Maximum 100');
  });

  // HS-A11: Partial failure (3 valid + 1 invalid -> 207)
  it('HS-A11: returns 207 for partial failures', async () => {
    let callIdx = 0;
    const mockClient = {
      createRecord: vi.fn().mockImplementation(() => {
        callIdx++;
        if (callIdx === 2) {
          return Promise.reject(new Error('Validation failed'));
        }
        return Promise.resolve({ id: `new-${callIdx}`, properties: {} });
      }),
    };
    mockCreateClient.mockReturnValue(mockClient);

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        object_type: 'contacts',
        records: [
          { properties: { email: 'a@test.com' } },
          { properties: { email: 'invalid' } },
          { properties: { email: 'c@test.com' } },
          { properties: { email: 'd@test.com' } },
        ],
      })
    );

    expect(res.status).toBe(207);
    const data = await res.json();
    expect(data.summary.created).toBe(3);
    expect(data.summary.errors).toBe(1);
  });

  // HS-A12: Rate limited
  it('HS-A12: returns 429 when rate limited', async () => {
    mockRateLimitResponse.mockReturnValue(
      NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 }
      )
    );

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        object_type: 'companies',
        records: [{ properties: { name: 'Test' } }],
      })
    );

    expect(res.status).toBe(429);
  });

  it('returns 400 for empty records array', async () => {
    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        object_type: 'companies',
        records: [],
      })
    );

    expect(res.status).toBe(400);
  });
});
