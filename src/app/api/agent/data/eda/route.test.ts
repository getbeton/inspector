import { NextRequest } from 'next/server';
import { POST, GET } from './route';

/**
 * Tests for the EDA (Exploratory Data Analysis) agent data endpoint.
 *
 * POST — Ingests EDA results from the agent, upserts into `eda_results`.
 * GET  — Returns EDA results. Supports agent auth (service role) or
 *         authenticated user (Supabase SSR client).
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

// Helper: build a chainable Supabase mock
function createSupabaseMock(overrides?: {
  upsertResult?: { error: null | { message: string } };
  selectResult?: { data: unknown; error: null | { message: string } };
}) {
  // The query chain must be both chainable (.eq().eq()) and awaitable.
  // We accomplish this by adding a .then() method so that `await chain`
  // resolves to the selectResult, while .eq() always returns `this`.
  const selectResult = overrides?.selectResult ?? { data: [], error: null };

  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue(overrides?.upsertResult ?? { error: null }),
    then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve(selectResult)),
  };

  return {
    auth: { getUser: vi.fn() },
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// Helper: create NextRequest
function makePostRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/agent/data/eda', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(params: Record<string, string>, headers?: Record<string, string>) {
  const url = new URL('http://localhost:3000/api/agent/data/eda');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET', headers });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

describe('POST /api/agent/data/eda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when auth fails', async () => {
    mockValidateAgentRequest.mockReturnValue(false);

    const res = await POST(makePostRequest({ workspace_id: 'ws-1', table_id: 't-1' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when workspace_id is missing', async () => {
    mockValidateAgentRequest.mockReturnValue(true);

    const res = await POST(makePostRequest({ table_id: 't-1' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields' });
  });

  it('returns 400 when table_id is missing', async () => {
    mockValidateAgentRequest.mockReturnValue(true);

    const res = await POST(makePostRequest({ workspace_id: 'ws-1' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields' });
  });

  it('returns 200 and upserts correct data on success', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const mock = createSupabaseMock();
    mockCreateAdminClient.mockReturnValue(mock);

    const body = {
      workspace_id: 'ws-1',
      table_id: 't-1',
      join_suggestions: ['join A'],
      metrics_discovery: { metric: 'x' },
      table_stats: { rows: 100 },
      summary_text: 'Summary',
    };

    const res = await POST(makePostRequest(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // Verify the upsert was called on the right table
    expect(mock.from).toHaveBeenCalledWith('eda_results');
    expect(mock._chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        table_id: 't-1',
        join_suggestions: ['join A'],
        metrics_discovery: { metric: 'x' },
        table_stats: { rows: 100 },
        summary_text: 'Summary',
        updated_at: expect.any(String),
      }),
      { onConflict: 'workspace_id, table_id' },
    );
  });

  it('returns 500 when Supabase upsert fails', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const mock = createSupabaseMock({
      upsertResult: { error: { message: 'DB failure' } },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const res = await POST(makePostRequest({ workspace_id: 'ws-1', table_id: 't-1' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'DB failure' });
  });
});

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

describe('GET /api/agent/data/eda', () => {
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

  it('returns 200 with data for agent request (uses service role client)', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const edaRows = [{ id: 1, workspace_id: 'ws-1', table_id: 't-1' }];
    const mock = createSupabaseMock({ selectResult: { data: edaRows, error: null } });
    mockCreateRawClient.mockReturnValue(mock);

    const res = await GET(makeGetRequest({ workspaceId: 'ws-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(edaRows);

    // Should use the raw Supabase client (service role), not SSR client
    expect(mockCreateRawClient).toHaveBeenCalledWith('https://test.supabase.co', 'service-key');
    expect(mockCreateSSRClient).not.toHaveBeenCalled();
  });

  it('returns 200 with data for authenticated user request', async () => {
    mockValidateAgentRequest.mockReturnValue(false);
    const edaRows = [{ id: 2, workspace_id: 'ws-2', table_id: 't-2' }];
    const mock = createSupabaseMock({ selectResult: { data: edaRows, error: null } });
    mock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    mockCreateSSRClient.mockResolvedValue(mock);

    const res = await GET(makeGetRequest({ workspaceId: 'ws-2' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(edaRows);

    // Should use SSR client, not raw client
    expect(mockCreateSSRClient).toHaveBeenCalled();
    expect(mockCreateRawClient).not.toHaveBeenCalled();
  });

  it('filters by tableId when provided', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const edaRows = [{ id: 1, workspace_id: 'ws-1', table_id: 't-specific' }];
    const mock = createSupabaseMock({ selectResult: { data: edaRows, error: null } });
    mockCreateRawClient.mockReturnValue(mock);

    const res = await GET(makeGetRequest({ workspaceId: 'ws-1', tableId: 't-specific' }));
    expect(res.status).toBe(200);

    // `.eq()` should be called twice: once for workspace_id, once for table_id
    expect(mock._chain.eq).toHaveBeenCalledTimes(2);
    expect(mock._chain.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(mock._chain.eq).toHaveBeenCalledWith('table_id', 't-specific');
  });

  it('returns 500 when Supabase query fails', async () => {
    mockValidateAgentRequest.mockReturnValue(true);
    const mock = createSupabaseMock({
      selectResult: { data: null, error: { message: 'Query error' } },
    });
    mockCreateRawClient.mockReturnValue(mock);

    const res = await GET(makeGetRequest({ workspaceId: 'ws-1' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Query error' });
  });
});
