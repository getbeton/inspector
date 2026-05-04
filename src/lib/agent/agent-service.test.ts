import { AgentService } from './agent-service';

/**
 * Tests for AgentService.triggerAnalysis().
 *
 * The service fetches workspace details, then fires two requests
 * to the external Agent API:
 * 1. Create session  (POST /apps/.../sessions/...)
 * 2. Start run        (POST /run)
 *
 * No credentials are sent to the agent — it uses Inspector callback
 * routes which resolve credentials server-side.
 *
 * Session lifecycle is tracked via createSession() and updateSessionStatus().
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// `after()` from next/server needs a request context. In tests we stub it to
// invoke the callback synchronously (fire-and-forget) so the /run fetch + the
// status transition can still be observed in assertions.
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void> | void) => { void cb(); },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/agent/session', () => ({
  createSession: vi.fn(),
  updateSessionStatus: vi.fn(),
}));

vi.mock('@/lib/integrations/credentials', () => ({
  isIntegrationConfiguredAdmin: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSession, updateSessionStatus } from '@/lib/agent/session';
import { isIntegrationConfiguredAdmin } from '@/lib/integrations/credentials';

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;
const mockCreateSession = createSession as ReturnType<typeof vi.fn>;
const mockUpdateSessionStatus = updateSessionStatus as ReturnType<typeof vi.fn>;
const mockIsIntegrationConfigured = isIntegrationConfiguredAdmin as ReturnType<typeof vi.fn>;

// Capture fetch calls
const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

function mockFetchSuccess() {
  globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init: init || {} });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;
}

function mockFetchNetworkError() {
  globalThis.fetch = vi.fn().mockImplementation(async () => {
    throw new Error('Network unreachable');
  }) as any;
}

function createSupabaseMock(workspace: { website_url: string | null; slug: string } | null, error?: { message: string }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: workspace, error: error || null }),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentService.triggerAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCalls = [];
    vi.stubEnv('AGENT_API_URL', 'https://agent.test.com');
    mockCreateSession.mockResolvedValue(undefined);
    mockUpdateSessionStatus.mockResolvedValue(undefined);
    mockIsIntegrationConfigured.mockResolvedValue(false);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('throws when workspace is not found', async () => {
    const mock = createSupabaseMock(null, { message: 'Not found' });
    mockCreateClient.mockResolvedValue(mock);

    await expect(AgentService.triggerAnalysis('ws-missing'))
      .rejects.toThrow('Workspace not found');
  });

  it('creates session and triggers run on success', async () => {
    const mock = createSupabaseMock({ website_url: 'https://example.com', slug: 'test-co' });
    mockCreateClient.mockResolvedValue(mock);
    mockFetchSuccess();

    await AgentService.triggerAnalysis('ws-123');

    // Should have persisted the session to DB
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.stringMatching(/^s_/),
      'ws-123'
    );

    // Should have created a session on the Agent API first
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    const sessionCall = fetchCalls[0];
    expect(sessionCall.url).toMatch(/\/apps\/upsell_agent\/users\/ws-123\/sessions\/s_/);
    expect(sessionCall.init.method).toBe('POST');

    // The run call is fire-and-forget, so wait a tick for it to resolve
    await new Promise(r => setTimeout(r, 10));
    expect(fetchCalls.length).toBe(2);

    const runCall = fetchCalls[1];
    expect(runCall.url).toBe('https://agent.test.com/run');

    // Verify context contains workspace info but NO credentials
    const runBody = JSON.parse(runCall.init.body as string);
    expect(runBody.context.workspace_id).toBe('ws-123');
    expect(runBody.context.session_id).toMatch(/^s_/);
    expect(runBody.context.inspector_callback_url).toBeDefined();
    expect(runBody.context.capabilities).toBeDefined();
    expect(runBody.context.posthog).toBeUndefined();

    // Prompt should contain the website URL
    const promptText = runBody.newMessage.parts[0].text;
    expect(promptText).toContain('https://example.com');

    // Session status should be updated to 'running' after successful fire
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith(
      expect.stringMatching(/^s_/),
      'running'
    );
  });

  it('does not throw when agent API is unreachable (fire-and-forget)', async () => {
    const mock = createSupabaseMock({ website_url: 'https://example.com', slug: 'test' });
    mockCreateClient.mockResolvedValue(mock);
    mockFetchNetworkError();

    // Should not throw — agent errors are caught internally
    await expect(AgentService.triggerAnalysis('ws-down')).resolves.toBeUndefined();

    // Session should still be persisted to DB even when Agent is unreachable
    expect(mockCreateSession).toHaveBeenCalled();
  });

  it('does not call the agent when AGENT_API_URL is not set (caught internally)', async () => {
    vi.stubEnv('AGENT_API_URL', '');
    const mock = createSupabaseMock({ website_url: 'https://example.com', slug: 'test' });
    mockCreateClient.mockResolvedValue(mock);
    mockFetchSuccess();

    // The throw inside getAgentApiUrl() is caught by triggerAnalysis's try/catch.
    // Test contract: no fetch is made and the function does not blow up the route.
    await expect(AgentService.triggerAnalysis('ws-no-url')).resolves.toBeUndefined();
    expect(fetchCalls.length).toBe(0);
  });

  it('continues even when session DB persistence fails', async () => {
    const mock = createSupabaseMock({ website_url: 'https://example.com', slug: 'test' });
    mockCreateClient.mockResolvedValue(mock);
    mockCreateSession.mockRejectedValue(new Error('DB write failed'));
    mockFetchSuccess();

    // Should NOT throw — session persistence failure is non-blocking
    await expect(AgentService.triggerAnalysis('ws-db-fail')).resolves.toBeUndefined();

    // Should still make the Agent API calls
    await new Promise(r => setTimeout(r, 10));
    expect(fetchCalls.length).toBe(2);
  });

  it('marks session failed and skips /run when session-create returns non-ok', async () => {
    const mock = createSupabaseMock({ website_url: 'https://example.com', slug: 'test' });
    mockCreateClient.mockResolvedValue(mock);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init: init || {} });
      return new Response('App not found', { status: 404 });
    }) as unknown as typeof fetch;

    await AgentService.triggerAnalysis('ws-bad-app');

    // Only the session-create call should have fired — /run must be skipped
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toMatch(/\/apps\/upsell_agent\/users\/ws-bad-app\/sessions\/s_/);

    // Session should be marked failed with the backend response
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith(
      expect.stringMatching(/^s_/),
      'failed',
      expect.stringContaining('404')
    );
  });
});

// ---------------------------------------------------------------------------
// triggerAnalysisIfNotRecentlyRun — idempotency guard
// ---------------------------------------------------------------------------

function createSessionsQueryMock(rows: Array<{ session_id: string; status: string }>, error?: { message: string }) {
  // Chain: from(...).select(...).eq(...).in(...).gte(...).limit(...) -> Promise<{data,error}>
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: error || null }),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
  };
}

describe('AgentService.triggerAnalysisIfNotRecentlyRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCalls = [];
    vi.stubEnv('AGENT_API_URL', 'https://agent.test.com');
    mockCreateSession.mockResolvedValue(undefined);
    mockUpdateSessionStatus.mockResolvedValue(undefined);
    mockIsIntegrationConfigured.mockResolvedValue(false);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('skips trigger when a recent running/completed session exists', async () => {
    mockCreateAdminClient.mockReturnValue(
      createSessionsQueryMock([{ session_id: 's_existing', status: 'running' }])
    );

    await AgentService.triggerAnalysisIfNotRecentlyRun('ws-busy');

    // Should NOT have hit the workspace-fetch code path or the agent API
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(fetchCalls.length).toBe(0);
  });

  it('proceeds to triggerAnalysis when no recent session exists', async () => {
    mockCreateAdminClient.mockReturnValue(createSessionsQueryMock([]));
    const mock = createSupabaseMock({ website_url: 'https://example.com', slug: 'test' });
    mockCreateClient.mockResolvedValue(mock);
    mockFetchSuccess();

    await AgentService.triggerAnalysisIfNotRecentlyRun('ws-fresh');

    // Full trigger path should have run
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.stringMatching(/^s_/),
      'ws-fresh'
    );
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('proceeds (fail-open) when the idempotency DB read errors', async () => {
    mockCreateAdminClient.mockReturnValue(
      createSessionsQueryMock([], { message: 'DB transient error' })
    );
    const mock = createSupabaseMock({ website_url: 'https://example.com', slug: 'test' });
    mockCreateClient.mockResolvedValue(mock);
    mockFetchSuccess();

    await AgentService.triggerAnalysisIfNotRecentlyRun('ws-db-err');

    // Must have fallen through to the trigger path rather than silently hanging
    expect(mockCreateSession).toHaveBeenCalled();
  });
});
