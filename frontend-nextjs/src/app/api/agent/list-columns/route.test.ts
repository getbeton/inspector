import { NextRequest } from 'next/server';
import { GET } from './route';

/**
 * Tests for GET /api/agent/list-columns
 *
 * Returns column metadata and example values for a given table.
 * Validates table_id against a strict regex to prevent injection.
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
  const url = new URL('http://localhost:3000/api/agent/list-columns');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/agent/list-columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when auth fails', async () => {
    mockValidate.mockReturnValue(false);
    const res = await GET(makeRequest({ session_id: 's_1', table_id: 'events' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when session_id is missing', async () => {
    mockValidate.mockReturnValue(true);
    const res = await GET(makeRequest({ table_id: 'events' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing session_id or table_id' });
  });

  it('returns 400 when table_id is missing', async () => {
    mockValidate.mockReturnValue(true);
    const res = await GET(makeRequest({ session_id: 's_1' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing session_id or table_id' });
  });

  it('returns 400 for SQL injection attempt in table_id', async () => {
    mockValidate.mockReturnValue(true);
    const res = await GET(makeRequest({ session_id: 's_1', table_id: "events; DROP TABLE users--" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid table_id format' });
  });

  it('returns 400 for table_id with special characters', async () => {
    mockValidate.mockReturnValue(true);
    const res = await GET(makeRequest({ session_id: 's_1', table_id: "table-with-dashes" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid table_id format' });
  });

  it('returns 404 when session is not found', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockRejectedValue(new Error('Session not found'));

    const res = await GET(makeRequest({ session_id: 's_bad', table_id: 'events' }));
    expect(res.status).toBe(404);
  });

  it('returns columns with examples on success', async () => {
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
      query: vi.fn()
        // First call: column metadata
        .mockResolvedValueOnce({
          results: [
            ['event', 'String'],
            ['timestamp', 'DateTime'],
            ['distinct_id', 'String'],
          ],
          columns: ['name', 'type'],
        })
        // Second call: sample rows
        .mockResolvedValueOnce({
          results: [
            ['pageview', '2026-01-01T00:00:00Z', 'user-1'],
            ['click', '2026-01-02T00:00:00Z', 'user-2'],
            ['signup', '2026-01-03T00:00:00Z', 'user-3'],
          ],
          columns: ['event', 'timestamp', 'distinct_id'],
        }),
    };
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_1', table_id: 'events' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.table_id).toBe('events');
    expect(body.columns).toHaveLength(3);
    expect(body.columns[0]).toEqual({
      col_id: 'event',
      col_name: 'event',
      col_type: 'String',
      examples: ['pageview', 'click', 'signup'],
    });
    expect(body.columns[1]).toEqual({
      col_id: 'timestamp',
      col_name: 'timestamp',
      col_type: 'DateTime',
      examples: ['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z'],
    });
  });

  it('returns columns without examples when sample query fails', async () => {
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
      query: vi.fn()
        .mockResolvedValueOnce({
          results: [['id', 'UInt64']],
          columns: ['name', 'type'],
        })
        .mockRejectedValueOnce(new Error('Table not queryable')),
    };
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_1', table_id: 'system_table' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.columns[0].examples).toEqual([]);
  });

  it('accepts valid table identifiers', async () => {
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
      query: vi.fn().mockResolvedValue({ results: [], columns: [] }),
    };
    mockCreatePostHogClient.mockReturnValue(mockClient);

    // Valid identifiers should pass regex
    const res = await GET(makeRequest({ session_id: 's_1', table_id: '_my_table_123' }));
    expect(res.status).toBe(200);
  });
});
