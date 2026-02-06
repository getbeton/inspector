import { NextRequest } from 'next/server';
import { GET } from './route';

/**
 * Tests for GET /api/agent/list-tables
 *
 * Lists available PostHog tables via HogQL system.tables query.
 * Requires agent auth, session resolution, and PostHog credentials.
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

vi.mock('@/lib/integrations/credentials', () => ({
  getIntegrationCredentialsAdmin: vi.fn(),
}));

vi.mock('@/lib/integrations/posthog/client', () => ({
  createPostHogClient: vi.fn(),
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
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials';
import { createPostHogClient } from '@/lib/integrations/posthog/client';

const mockValidate = validateAgentRequest as ReturnType<typeof vi.fn>;
const mockResolveSession = resolveSession as ReturnType<typeof vi.fn>;
const mockGetCreds = getIntegrationCredentialsAdmin as ReturnType<typeof vi.fn>;
const mockCreatePostHogClient = createPostHogClient as ReturnType<typeof vi.fn>;

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost:3000/api/agent/list-tables');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/agent/list-tables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when auth fails', async () => {
    mockValidate.mockReturnValue(false);
    const res = await GET(makeRequest({ session_id: 's_123' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when session_id is missing', async () => {
    mockValidate.mockReturnValue(true);
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing session_id' });
  });

  it('returns 404 when session is not found', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockRejectedValue(new Error('Session not found'));

    const res = await GET(makeRequest({ session_id: 's_bad' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Session not found' });
  });

  it('returns 404 when PostHog credentials are missing', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });
    mockGetCreds.mockResolvedValue(null);

    const res = await GET(makeRequest({ session_id: 's_123' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'PostHog integration not found' });
  });

  it('returns tables on success', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });
    mockGetCreds.mockResolvedValue({
      apiKey: 'phx_key',
      projectId: '123',
      host: 'https://us.posthog.com',
      isActive: true,
      status: 'active',
    });

    const mockClient = {
      query: vi.fn().mockResolvedValue({
        results: [
          ['events', 'MergeTree', 1000000, 50000000],
          ['persons', 'ReplacingMergeTree', 5000, 200000],
        ],
        columns: ['name', 'engine', 'total_rows', 'total_bytes'],
      }),
    };
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_123' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tables).toHaveLength(2);
    expect(body.tables[0]).toEqual({
      table_id: 'events',
      table_name: 'events',
      engine: 'MergeTree',
      total_rows: 1000000,
      total_bytes: 50000000,
    });
    expect(body.tables[1]).toEqual({
      table_id: 'persons',
      table_name: 'persons',
      engine: 'ReplacingMergeTree',
      total_rows: 5000,
      total_bytes: 200000,
    });
  });

  it('filters out tables with invalid names', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });
    mockGetCreds.mockResolvedValue({
      apiKey: 'phx_key',
      projectId: '123',
      host: null,
      isActive: true,
      status: 'active',
    });

    const mockClient = {
      query: vi.fn().mockResolvedValue({
        results: [
          ['valid_table', 'MergeTree', 100, 5000],
          ['invalid-table-name!', 'MergeTree', 100, 5000],
        ],
        columns: ['name', 'engine', 'total_rows', 'total_bytes'],
      }),
    };
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_123' }));
    const body = await res.json();
    expect(body.tables).toHaveLength(1);
    expect(body.tables[0].table_id).toBe('valid_table');
  });
});
