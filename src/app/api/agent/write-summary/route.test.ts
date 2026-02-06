import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Tests for POST /api/agent/write-summary
 *
 * Composite endpoint that writes EDA results and/or website exploration
 * data in a single call, then marks the session as completed.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/agent/auth', () => ({
  validateAgentRequest: vi.fn(),
}));

vi.mock('@/lib/agent/session', () => ({
  resolveSession: vi.fn(),
  updateSessionStatus: vi.fn(),
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
import { resolveSession, updateSessionStatus } from '@/lib/agent/session';
import { createAdminClient } from '@/lib/supabase/admin';

const mockValidate = validateAgentRequest as ReturnType<typeof vi.fn>;
const mockResolveSession = resolveSession as ReturnType<typeof vi.fn>;
const mockUpdateSessionStatus = updateSessionStatus as ReturnType<typeof vi.fn>;
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/agent/write-summary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock(overrides?: {
  upsertResult?: { error: null | { message: string } };
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    upsert: vi.fn().mockResolvedValue(overrides?.upsertResult ?? { error: null }),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agent/write-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSessionStatus.mockResolvedValue(undefined);
  });

  it('returns 401 when auth fails', async () => {
    mockValidate.mockReturnValue(false);
    const res = await POST(makeRequest({ session_id: 's_1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when session_id is missing', async () => {
    mockValidate.mockReturnValue(true);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing session_id' });
  });

  it('returns 400 when neither eda_results nor website_exploration is provided', async () => {
    mockValidate.mockReturnValue(true);
    const res = await POST(makeRequest({ session_id: 's_1' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'At least one of eda_results or website_exploration is required',
    });
  });

  it('returns 404 when session is not found', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockRejectedValue(new Error('Session not found'));

    const res = await POST(makeRequest({
      session_id: 's_bad',
      eda_results: [{ table_id: 't1' }],
    }));
    expect(res.status).toBe(404);
  });

  it('upserts EDA results and marks session completed', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });

    const mock = createSupabaseMock();
    mockCreateAdminClient.mockReturnValue(mock);

    const res = await POST(makeRequest({
      session_id: 's_1',
      eda_results: [
        { table_id: 'events', summary_text: 'Event data analysis' },
        { table_id: 'persons', summary_text: 'Person data analysis' },
      ],
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // Should have called upsert twice (one per EDA entry)
    expect(mock._chain.upsert).toHaveBeenCalledTimes(2);
    expect(mock.from).toHaveBeenCalledWith('eda_results');

    // Session should be marked as completed
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith('s_1', 'completed');
  });

  it('upserts website exploration and marks session completed', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });

    const mock = createSupabaseMock();
    mockCreateAdminClient.mockReturnValue(mock);

    const res = await POST(makeRequest({
      session_id: 's_1',
      website_exploration: {
        is_b2b: true,
        plg_type: 'plg',
        website_url: 'https://example.com',
        product_description: 'A SaaS product',
      },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(mock.from).toHaveBeenCalledWith('website_exploration_results');
    expect(mock._chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        is_b2b: true,
        plg_type: 'plg',
        website_url: 'https://example.com',
        product_description: 'A SaaS product',
      }),
      { onConflict: 'workspace_id' }
    );

    expect(mockUpdateSessionStatus).toHaveBeenCalledWith('s_1', 'completed');
  });

  it('upserts both EDA and website exploration together', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });

    const mock = createSupabaseMock();
    mockCreateAdminClient.mockReturnValue(mock);

    const res = await POST(makeRequest({
      session_id: 's_1',
      eda_results: [{ table_id: 'events', summary_text: 'Analysis' }],
      website_exploration: { is_b2b: false },
    }));

    expect(res.status).toBe(200);

    // from() should be called for both tables
    expect(mock.from).toHaveBeenCalledWith('eda_results');
    expect(mock.from).toHaveBeenCalledWith('website_exploration_results');
  });

  it('returns 500 when EDA upsert fails', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });

    const mock = createSupabaseMock({
      upsertResult: { error: { message: 'DB failure' } },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const res = await POST(makeRequest({
      session_id: 's_1',
      eda_results: [{ table_id: 'events' }],
    }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'EDA upsert failed: DB failure' });

    // Session should NOT be marked as completed on failure
    expect(mockUpdateSessionStatus).not.toHaveBeenCalled();
  });

  it('skips EDA entries without table_id', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });

    const mock = createSupabaseMock();
    mockCreateAdminClient.mockReturnValue(mock);

    const res = await POST(makeRequest({
      session_id: 's_1',
      eda_results: [
        { summary_text: 'No table_id' }, // should be skipped
        { table_id: 'events', summary_text: 'Valid' },
      ],
    }));

    expect(res.status).toBe(200);
    // Only one upsert (the valid one)
    expect(mock._chain.upsert).toHaveBeenCalledTimes(1);
  });
});
