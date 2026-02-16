import { NextRequest } from 'next/server';
import { GET } from './route';

/**
 * Tests for GET /api/agent/list-columns
 *
 * Returns column metadata and non-empty sample values for a given table.
 * Uses allowlist validation (table must exist in warehouse or schema).
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

/** Helper: build a mock client with warehouse tables, schema, and optional query results */
function buildMockClient(opts: {
  warehouseTables?: unknown[];
  schema?: Record<string, unknown>;
  queryResult?: { results: unknown[][]; columns: string[] };
  queryError?: Error;
}) {
  return {
    getWarehouseTables: vi.fn().mockResolvedValue(opts.warehouseTables ?? []),
    getDatabaseSchema: vi.fn().mockResolvedValue(opts.schema ?? {}),
    query: opts.queryError
      ? vi.fn().mockRejectedValue(opts.queryError)
      : vi.fn().mockResolvedValue(opts.queryResult ?? { results: [], columns: [] }),
  };
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

  it('returns 404 when table is not in warehouse or schema', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });
    mockGetCreds.mockResolvedValue({
      apiKey: 'phx_key', projectId: '123', host: null, isActive: true, status: 'active',
    });

    const mockClient = buildMockClient({
      warehouseTables: [],
      schema: { events: { type: 'posthog', id: 'events', name: 'events', fields: {} } },
    });
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_1', table_id: 'nonexistent_table' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('returns 404 when session is not found', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockRejectedValue(new Error('Session not found'));

    const res = await GET(makeRequest({ session_id: 's_bad', table_id: 'events' }));
    expect(res.status).toBe(404);
  });

  it('returns columns with samples from warehouse table', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });
    mockGetCreds.mockResolvedValue({
      apiKey: 'phx_key', projectId: '123', host: 'https://us.posthog.com',
      isActive: true, status: 'active',
    });

    const mockClient = buildMockClient({
      warehouseTables: [
        {
          id: 'wh-1',
          name: 'googlesheets_people',
          format: 'DeltaS3Wrapper',
          columns: [
            { key: 'name', name: 'name', type: 'string', schema_valid: true },
            { key: 'email', name: 'email', type: 'string', schema_valid: true },
          ],
          external_data_source: { id: 'src-1', source_type: 'GoogleSheets' },
        },
      ],
      queryResult: {
        results: [
          ['Alice', 'alice@example.com'],
          [null, 'bob@example.com'],
          ['Charlie', ''],
          ['Diana', 'diana@example.com'],
        ],
        columns: ['name', 'email'],
      },
    });
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_1', table_id: 'googlesheets_people' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.table_name).toBe('googlesheets_people');
    expect(body.queryable_name).toBe('googlesheets_people');
    expect(body.source_type).toBe('GoogleSheets');
    expect(body.columns).toHaveLength(2);

    // 'name' column: skips null at index 1, gets Alice, Charlie, Diana
    expect(body.columns[0]).toEqual({
      name: 'name',
      type: 'string',
      samples: ['Alice', 'Charlie', 'Diana'],
    });
    // 'email' column: skips empty string at index 2
    expect(body.columns[1]).toEqual({
      name: 'email',
      type: 'string',
      samples: ['alice@example.com', 'bob@example.com', 'diana@example.com'],
    });
  });

  it('returns columns from schema fallback for native PostHog tables', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });
    mockGetCreds.mockResolvedValue({
      apiKey: 'phx_key', projectId: '123', host: null, isActive: true, status: 'active',
    });

    const mockClient = buildMockClient({
      warehouseTables: [],
      schema: {
        events: {
          type: 'posthog',
          id: 'events',
          name: 'events',
          fields: {
            event: { key: 'event', type: 'string' },
            timestamp: { key: 'timestamp', type: 'datetime' },
            pdi: { key: 'pdi', type: 'lazy_table' }, // should be filtered
          },
        },
      },
      queryResult: {
        results: [
          ['pageview', '2026-01-01T00:00:00Z'],
          ['click', '2026-01-02T00:00:00Z'],
        ],
        columns: ['event', 'timestamp'],
      },
    });
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_1', table_id: 'events' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.source_type).toBe('posthog');
    // Should have 2 columns (pdi lazy_table is filtered out)
    expect(body.columns).toHaveLength(2);
    expect(body.columns[0]).toEqual({
      name: 'event',
      type: 'string',
      samples: ['pageview', 'click'],
    });
  });

  it('returns columns without samples when HogQL query fails', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });
    mockGetCreds.mockResolvedValue({
      apiKey: 'phx_key', projectId: '123', host: null, isActive: true, status: 'active',
    });

    const mockClient = buildMockClient({
      warehouseTables: [
        {
          id: 'wh-1',
          name: 'broken_table',
          format: 'DeltaS3Wrapper',
          columns: [{ key: 'col_a', name: 'col_a', type: 'string', schema_valid: true }],
          external_data_source: { id: 'src-1', source_type: 'Postgres' },
        },
      ],
      queryError: new Error('Table not queryable'),
    });
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_1', table_id: 'broken_table' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.columns[0].samples).toEqual([]);
  });

  it('accepts table IDs that would fail old regex (SQL injection blocked by allowlist)', async () => {
    mockValidate.mockReturnValue(true);
    mockResolveSession.mockResolvedValue({ workspaceId: 'ws-1', status: 'running' });
    mockGetCreds.mockResolvedValue({
      apiKey: 'phx_key', projectId: '123', host: null, isActive: true, status: 'active',
    });

    // SQL injection attempt: table doesn't exist in allowlist → 404
    const mockClient = buildMockClient({ warehouseTables: [], schema: {} });
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(
      makeRequest({ session_id: 's_1', table_id: "events; DROP TABLE users--" })
    );
    expect(res.status).toBe(404);
  });
});
