import { NextRequest } from 'next/server';
import { POST, GET } from './route';

/**
 * Tests for the website-exploration agent data endpoint.
 *
 * POST — Ingests website exploration results from the agent, upserts into
 *         `website_exploration_results` keyed on workspace_id.
 * GET  — Returns a single exploration result for a workspace. Handles the
 *         PGRST116 "no rows found" error gracefully (returns null).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/agent/auth', () => ({
  validateAgentRequest: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
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
import { createClient as createSSRClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createRawClient } from '@supabase/supabase-js';

const mockValidateAgentRequest = validateAgentRequest as ReturnType<typeof vi.fn>;
const mockCreateSSRClient = createSSRClient as ReturnType<typeof vi.fn>;
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;
const mockCreateRawClient = createRawClient as ReturnType<typeof vi.fn>;

// Helper: chainable Supabase mock
function createSupabaseMock(overrides?: {
  upsertResult?: { error: null | { message: string } };
  singleResult?: { data: unknown; error: null | { message: string; code?: string } };
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(overrides?.singleResult ?? { data: null, error: null }),
    upsert: vi.fn().mockResolvedValue(overrides?.upsertResult ?? { error: null }),
  };

  return {
    auth: { getUser: vi.fn() },
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function makePostRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/agent/data/website-exploration', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(params: Record<string, string>, headers?: Record<string, string>) {
  const url = new URL('http://localhost:3000/api/agent/data/website-exploration');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET', headers });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

describe('POST /api/agent/data/website-exploration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when auth fails', async () => {
    mockValidateAgentRequest.mockReturnValue(false);

    const res = await POST(makePostRequest({ workspace_id: 'ws-1' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when workspace_id is missing', async () => {
    mockValidateAgentRequest.mockReturnValue(true);

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing workspace_id' });
  });

  it('returns 200 and upserts correct data on success', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const mock = createSupabaseMock();
    mockCreateAdminClient.mockReturnValue(mock);

    const body = {
      workspace_id: 'ws-1',
      is_b2b: true,
      plg_type: 'freemium',
      website_url: 'https://example.com',
      product_assumptions: 'SaaS tool',
      icp_description: 'Mid-market B2B',
      product_description: 'Analytics platform',
      pricing_model: 'usage-based',
    };

    const res = await POST(makePostRequest(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(mock.from).toHaveBeenCalledWith('website_exploration_results');
    expect(mock._chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        is_b2b: true,
        plg_type: 'freemium',
        website_url: 'https://example.com',
        product_assumptions: 'SaaS tool',
        icp_description: 'Mid-market B2B',
        product_description: 'Analytics platform',
        pricing_model: 'usage-based',
        updated_at: expect.any(String),
      }),
      { onConflict: 'workspace_id' },
    );
  });

  it('returns 500 when Supabase upsert fails', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const mock = createSupabaseMock({
      upsertResult: { error: { message: 'Conflict error' } },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const res = await POST(makePostRequest({ workspace_id: 'ws-1' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Conflict error' });
  });
});

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

describe('GET /api/agent/data/website-exploration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when not agent and not authenticated user', async () => {
    mockValidateAgentRequest.mockReturnValue(false);
    const mock = createSupabaseMock();
    mock.auth.getUser.mockResolvedValue({ data: { user: null } });
    mockCreateSSRClient.mockResolvedValue(mock);

    const res = await GET(makeGetRequest({ workspaceId: 'ws-1' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when workspaceId is missing', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const mock = createSupabaseMock();
    mockCreateRawClient.mockReturnValue(mock);

    const res = await GET(makeGetRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing workspaceId' });
  });

  it('returns 200 with data on success', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const row = {
      workspace_id: 'ws-1',
      is_b2b: true,
      website_url: 'https://example.com',
    };
    const mock = createSupabaseMock({
      singleResult: { data: row, error: null },
    });
    mockCreateRawClient.mockReturnValue(mock);

    const res = await GET(makeGetRequest({ workspaceId: 'ws-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);

    expect(mockCreateRawClient).toHaveBeenCalledWith('https://test.supabase.co', 'service-key');
    expect(mock.from).toHaveBeenCalledWith('website_exploration_results');
    expect(mock._chain.single).toHaveBeenCalled();
  });

  it('returns 200 with data for authenticated user request', async () => {
    mockValidateAgentRequest.mockReturnValue(false);
    const row = { workspace_id: 'ws-2', is_b2b: false };
    const mock = createSupabaseMock({
      singleResult: { data: row, error: null },
    });
    mock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    mockCreateSSRClient.mockResolvedValue(mock);

    const res = await GET(makeGetRequest({ workspaceId: 'ws-2' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);

    expect(mockCreateSSRClient).toHaveBeenCalled();
    expect(mockCreateRawClient).not.toHaveBeenCalled();
  });

  it('returns null when no results (PGRST116)', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const mock = createSupabaseMock({
      singleResult: {
        data: null,
        error: { message: 'No rows found', code: 'PGRST116' },
      },
    });
    mockCreateRawClient.mockReturnValue(mock);

    const res = await GET(makeGetRequest({ workspaceId: 'ws-empty' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('returns 500 when Supabase query fails with non-PGRST116 error', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const mock = createSupabaseMock({
      singleResult: {
        data: null,
        error: { message: 'Connection timeout', code: 'PGRST000' },
      },
    });
    mockCreateRawClient.mockReturnValue(mock);

    const res = await GET(makeGetRequest({ workspaceId: 'ws-1' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Connection timeout' });
  });
});
