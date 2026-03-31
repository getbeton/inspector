import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Tests for POST /api/agent/hubspot/entities
 * HS-A13 through HS-A15
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

vi.mock('@/lib/integrations/hubspot/entities', () => ({
  batchCreateChain: vi.fn(),
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
import { batchCreateChain } from '@/lib/integrations/hubspot/entities';

const mockValidate = validateAgentRequest as ReturnType<typeof vi.fn>;
const mockResolveSession = resolveSession as ReturnType<typeof vi.fn>;
const mockRateLimitResponse = rateLimitResponse as ReturnType<typeof vi.fn>;
const mockResolveConnection = resolveHubSpotConnectionAdmin as ReturnType<typeof vi.fn>;
const mockGetCredentials = getHubSpotConnectionCredentialsAdmin as ReturnType<typeof vi.fn>;
const mockCreateClient = createHubSpotClient as ReturnType<typeof vi.fn>;
const mockBatchCreateChain = batchCreateChain as ReturnType<typeof vi.fn>;

const TEST_WORKSPACE_ID = 'ws-entity-test';
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
  return new NextRequest('http://localhost:3000/api/agent/hubspot/entities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agent/hubspot/entities', () => {
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

  // HS-A13: Chain creation (company + contact + deal)
  it('HS-A13: creates full entity chain with URLs', async () => {
    mockBatchCreateChain.mockResolvedValue({
      company: {
        record_id: 'comp-1',
        object_type: 'companies',
        hubspot_url: 'https://app.hubspot.com/contacts/12345/company/comp-1',
      },
      contact: {
        record_id: 'cont-1',
        object_type: 'contacts',
        hubspot_url: 'https://app.hubspot.com/contacts/12345/contact/cont-1',
      },
      deal: {
        record_id: 'deal-1',
        object_type: 'deals',
        hubspot_url: 'https://app.hubspot.com/contacts/12345/deal/deal-1',
      },
    });

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        create_company: true,
        create_contact: true,
        create_deal: true,
        company_data: { name: 'Acme', domain: 'acme.com' },
        contact_data: { email: 'jane@acme.com', firstname: 'Jane' },
        deal_data: { dealname: 'Acme Upsell', amount: '50000' },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.company).toBeDefined();
    expect(data.contact).toBeDefined();
    expect(data.deal).toBeDefined();
    expect(data.company.hubspot_url).toContain('hubspot.com');
  });

  // HS-A14: Partial chain (contact only)
  it('HS-A14: creates partial chain with contact only', async () => {
    mockBatchCreateChain.mockResolvedValue({
      contact: {
        record_id: 'cont-1',
        object_type: 'contacts',
        hubspot_url: 'https://app.hubspot.com/contacts/12345/contact/cont-1',
      },
    });

    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
        create_contact: true,
        contact_data: { email: 'jane@acme.com' },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.contact).toBeDefined();
    expect(data.company).toBeUndefined();
    expect(data.deal).toBeUndefined();
  });

  // HS-A15: Uses admin credentials
  it('HS-A15: uses admin credential retrieval (getHubSpotConnectionCredentialsAdmin)', async () => {
    mockBatchCreateChain.mockResolvedValue({
      company: { record_id: 'comp-1', object_type: 'companies', hubspot_url: null },
    });

    await POST(
      makeRequest({
        session_id: 'sess-1',
        create_company: true,
        company_data: { name: 'Test' },
      })
    );

    // Verify admin credential path was used (not session-based)
    expect(mockGetCredentials).toHaveBeenCalledWith('conn-1');
    expect(mockResolveConnection).toHaveBeenCalledWith(TEST_WORKSPACE_ID, undefined);
  });

  it('returns 400 when no entity flags set', async () => {
    const res = await POST(
      makeRequest({
        session_id: 'sess-1',
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('At least one');
  });

  it('returns 401 when unauthorized', async () => {
    mockValidate.mockReturnValue(false);

    const res = await POST(
      makeRequest({ session_id: 'sess-1', create_company: true })
    );

    expect(res.status).toBe(401);
  });
});
