import { resolveSession, createSession, updateSessionStatus } from './session';

/**
 * Tests for session lifecycle helpers.
 *
 * All three functions use createAdminClient() to bypass RLS.
 * - resolveSession: looks up workspace_id, rejects terminal sessions
 * - createSession: inserts new session record
 * - updateSessionStatus: updates status, sets timestamps for lifecycle events
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

import { createAdminClient } from '@/lib/supabase/admin';

const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

function createSupabaseMock(overrides?: {
  selectSingleResult?: { data: unknown; error: null | { message: string } };
  insertResult?: { error: null | { message: string } };
  updateResult?: { error: null | { message: string } };
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(
      overrides?.selectSingleResult ?? { data: null, error: { message: 'Not found' } }
    ),
    insert: vi.fn().mockResolvedValue(overrides?.insertResult ?? { error: null }),
    update: vi.fn().mockReturnThis(),
  };

  // For update().eq() chain, the final eq() should resolve
  // We need to handle this by making the last eq() return the updateResult
  const updateChain: Record<string, ReturnType<typeof vi.fn>> = {
    eq: vi.fn().mockResolvedValue(overrides?.updateResult ?? { error: null }),
  };

  return {
    from: vi.fn().mockImplementation(() => {
      // Return different chains based on the operation
      return {
        select: chain.select,
        eq: chain.eq,
        single: chain.single,
        insert: chain.insert,
        update: vi.fn().mockReturnValue(updateChain),
      };
    }),
    _chain: chain,
    _updateChain: updateChain,
  };
}

// ---------------------------------------------------------------------------
// Tests: resolveSession
// ---------------------------------------------------------------------------

describe('resolveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when session is not found', async () => {
    const mock = createSupabaseMock({
      selectSingleResult: { data: null, error: { message: 'Not found' } },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    await expect(resolveSession('s_missing')).rejects.toThrow('Session not found');
  });

  it('throws when session is in terminal state (completed)', async () => {
    const mock = createSupabaseMock({
      selectSingleResult: {
        data: { workspace_id: 'ws-1', status: 'completed' },
        error: null,
      },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    await expect(resolveSession('s_done')).rejects.toThrow('Session is completed');
  });

  it('throws when session is in terminal state (failed)', async () => {
    const mock = createSupabaseMock({
      selectSingleResult: {
        data: { workspace_id: 'ws-1', status: 'failed' },
        error: null,
      },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    await expect(resolveSession('s_failed')).rejects.toThrow('Session is failed');
  });

  it('throws when session is in terminal state (closed)', async () => {
    const mock = createSupabaseMock({
      selectSingleResult: {
        data: { workspace_id: 'ws-1', status: 'closed' },
        error: null,
      },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    await expect(resolveSession('s_closed')).rejects.toThrow('Session is closed');
  });

  it('returns workspaceId and status for active session', async () => {
    const mock = createSupabaseMock({
      selectSingleResult: {
        data: { workspace_id: 'ws-abc', status: 'running' },
        error: null,
      },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await resolveSession('s_active');
    expect(result).toEqual({ workspaceId: 'ws-abc', status: 'running' });
  });

  it('returns for "created" status (non-terminal)', async () => {
    const mock = createSupabaseMock({
      selectSingleResult: {
        data: { workspace_id: 'ws-new', status: 'created' },
        error: null,
      },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await resolveSession('s_new');
    expect(result).toEqual({ workspaceId: 'ws-new', status: 'created' });
  });
});

// ---------------------------------------------------------------------------
// Tests: createSession
// ---------------------------------------------------------------------------

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a session record', async () => {
    const mock = createSupabaseMock({ insertResult: { error: null } });
    mockCreateAdminClient.mockReturnValue(mock);

    await expect(createSession('s_123', 'ws-1')).resolves.toBeUndefined();

    expect(mock.from).toHaveBeenCalledWith('workspace_agent_sessions');
  });

  it('uses default app name', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: insertFn }),
    });

    await createSession('s_123', 'ws-1');

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 's_123',
        workspace_id: 'ws-1',
        agent_app_name: 'upsell_agent',
        status: 'created',
      })
    );
  });

  it('uses custom app name when provided', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: insertFn }),
    });

    await createSession('s_123', 'ws-1', 'custom_agent');

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_app_name: 'custom_agent',
      })
    );
  });

  it('throws when insert fails', async () => {
    const mock = createSupabaseMock({
      insertResult: { error: { message: 'Duplicate key' } },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    await expect(createSession('s_dup', 'ws-1')).rejects.toThrow('Failed to create session');
  });
});

// ---------------------------------------------------------------------------
// Tests: updateSessionStatus
// ---------------------------------------------------------------------------

describe('updateSessionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates session status', async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });

    await expect(updateSessionStatus('s_123', 'running')).resolves.toBeUndefined();

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        started_at: expect.any(String),
      })
    );
    expect(eqFn).toHaveBeenCalledWith('session_id', 's_123');
  });

  it('sets completed_at for terminal states', async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });

    await updateSessionStatus('s_123', 'completed');

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        completed_at: expect.any(String),
      })
    );
  });

  it('includes error_message when provided', async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });

    await updateSessionStatus('s_123', 'failed', 'Something broke');

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: 'Something broke',
        completed_at: expect.any(String),
      })
    );
  });

  it('throws when update fails', async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: { message: 'DB error' } });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });

    await expect(updateSessionStatus('s_123', 'running')).rejects.toThrow('Failed to update session');
  });
});
