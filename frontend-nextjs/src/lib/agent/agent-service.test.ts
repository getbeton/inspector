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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/agent/session', () => ({
  createSession: vi.fn(),
  updateSessionStatus: vi.fn(),
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
import { createSession, updateSessionStatus } from '@/lib/agent/session';

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;
const mockCreateSession = createSession as ReturnType<typeof vi.fn>;
const mockUpdateSessionStatus = updateSessionStatus as ReturnType<typeof vi.fn>;

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

  it('uses default AGENT_API_URL when env var is not set', async () => {
    vi.stubEnv('AGENT_API_URL', '');
    const mock = createSupabaseMock({ website_url: 'https://example.com', slug: 'test' });
    mockCreateClient.mockResolvedValue(mock);
    mockFetchSuccess();

    await AgentService.triggerAnalysis('ws-default');

    // Since AGENT_API_URL is empty string (falsy), the || fallback kicks in
    expect(fetchCalls[0].url).toContain('inspector-ml-backend-production.up.railway.app');
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
});
