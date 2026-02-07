import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Tests for POST /api/agent/close-session
 *
 * Terminates a session by updating its status.
 * Supports optional status override and error message.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/agent/auth', () => ({
  validateAgentRequest: vi.fn(),
}));

vi.mock('@/lib/agent/session', () => ({
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

import { validateAgentRequest } from '@/lib/agent/auth';
import { updateSessionStatus } from '@/lib/agent/session';

const mockValidate = validateAgentRequest as ReturnType<typeof vi.fn>;
const mockUpdateSessionStatus = updateSessionStatus as ReturnType<typeof vi.fn>;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/agent/close-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agent/close-session', () => {
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

  it('closes session with default "closed" status', async () => {
    mockValidate.mockReturnValue(true);

    const res = await POST(makeRequest({ session_id: 's_123' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(mockUpdateSessionStatus).toHaveBeenCalledWith('s_123', 'closed', undefined);
  });

  it('uses provided status when it is a valid close status', async () => {
    mockValidate.mockReturnValue(true);

    const res = await POST(makeRequest({ session_id: 's_123', status: 'failed' }));
    expect(res.status).toBe(200);

    expect(mockUpdateSessionStatus).toHaveBeenCalledWith('s_123', 'failed', undefined);
  });

  it('uses provided status "completed"', async () => {
    mockValidate.mockReturnValue(true);

    const res = await POST(makeRequest({ session_id: 's_123', status: 'completed' }));
    expect(res.status).toBe(200);

    expect(mockUpdateSessionStatus).toHaveBeenCalledWith('s_123', 'completed', undefined);
  });

  it('falls back to "closed" for invalid status values', async () => {
    mockValidate.mockReturnValue(true);

    const res = await POST(makeRequest({ session_id: 's_123', status: 'running' }));
    expect(res.status).toBe(200);

    // 'running' is not a valid close status, should default to 'closed'
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith('s_123', 'closed', undefined);
  });

  it('passes error_message when provided', async () => {
    mockValidate.mockReturnValue(true);

    const res = await POST(makeRequest({
      session_id: 's_123',
      status: 'failed',
      error_message: 'Agent encountered an error',
    }));

    expect(res.status).toBe(200);
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith(
      's_123',
      'failed',
      'Agent encountered an error'
    );
  });

  it('returns 500 when updateSessionStatus throws', async () => {
    mockValidate.mockReturnValue(true);
    mockUpdateSessionStatus.mockRejectedValue(new Error('DB error'));

    const res = await POST(makeRequest({ session_id: 's_123' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'DB error' });
  });
});
