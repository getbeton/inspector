import { NextRequest } from 'next/server';
import { GET } from './route';

/**
 * Tests for GET /api/agent/list-tables
 *
 * Lists available tables from warehouse_tables API + DatabaseSchemaQuery.
 * Merges both sources with warehouse tables taking priority.
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

  it('returns merged tables from warehouse + schema', async () => {
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
      getWarehouseTables: vi.fn().mockResolvedValue([
        {
          id: '019bd69a-5b6a-0000',
          name: 'googlesheets_companies_clean',
          format: 'DeltaS3Wrapper',
          columns: [{ key: 'name', name: 'name', type: 'string', schema_valid: true }],
          external_data_source: { id: 'src-1', source_type: 'GoogleSheets' },
        },
      ]),
      getDatabaseSchema: vi.fn().mockResolvedValue({
        events: { type: 'posthog', id: 'events', name: 'events', fields: {} },
        persons: { type: 'posthog', id: 'persons', name: 'persons', fields: {} },
        lazy_join: { type: 'lazy_table', id: 'lazy', name: 'lazy_join', fields: {} },
      }),
    };
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_123' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    // Should have 3 tables: events, googlesheets_companies_clean, persons (sorted)
    // lazy_join should be filtered out as non-queryable
    expect(body.tables).toHaveLength(3);
    expect(body.tables[0]).toEqual({ table_name: 'events', source_type: 'posthog' });
    expect(body.tables[1]).toEqual({
      table_name: 'googlesheets_companies_clean',
      source_type: 'GoogleSheets',
    });
    expect(body.tables[2]).toEqual({ table_name: 'persons', source_type: 'posthog' });
  });

  it('warehouse tables override schema entries for the same name', async () => {
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
      getWarehouseTables: vi.fn().mockResolvedValue([
        {
          id: 'wh-1',
          name: 'stripe_charges',
          format: 'DeltaS3Wrapper',
          columns: [],
          external_data_source: { id: 'src-2', source_type: 'Stripe' },
        },
      ]),
      getDatabaseSchema: vi.fn().mockResolvedValue({
        stripe_charges: {
          type: 'data_warehouse',
          id: 'stripe_charges',
          name: 'stripe_charges',
          fields: {},
        },
      }),
    };
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_123' }));
    const body = await res.json();

    // Warehouse source_type should win over schema's generic 'posthog'
    expect(body.tables).toHaveLength(1);
    expect(body.tables[0].source_type).toBe('Stripe');
  });

  it('gracefully handles warehouse API failure', async () => {
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
      getWarehouseTables: vi.fn().mockRejectedValue(new Error('403 Forbidden')),
      getDatabaseSchema: vi.fn().mockResolvedValue({
        events: { type: 'posthog', id: 'events', name: 'events', fields: {} },
      }),
    };
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_123' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tables).toHaveLength(1);
    expect(body.tables[0].table_name).toBe('events');
  });

  it('strips null source_type from response', async () => {
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
      getWarehouseTables: vi.fn().mockResolvedValue([
        {
          id: 'wh-1',
          name: 'orphan_table',
          format: 'DeltaS3Wrapper',
          columns: [],
          external_data_source: null,
        },
      ]),
      getDatabaseSchema: vi.fn().mockResolvedValue({}),
    };
    mockCreatePostHogClient.mockReturnValue(mockClient);

    const res = await GET(makeRequest({ session_id: 's_123' }));
    const body = await res.json();

    // null source_type should be stripped by stripNulls
    expect(body.tables[0]).toEqual({ table_name: 'orphan_table' });
    expect(body.tables[0]).not.toHaveProperty('source_type');
  });
});
