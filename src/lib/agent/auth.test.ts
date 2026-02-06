import { NextRequest } from 'next/server';
import { validateAgentRequest } from './auth';

/**
 * Tests for the agent authentication utility.
 *
 * validateAgentRequest() checks the `x-agent-secret` header against
 * the AGENT_SECRET env var using timing-safe comparison.
 * When the env var is not set it blocks all requests (secure by default).
 */

function makeRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret !== undefined) {
    headers['x-agent-secret'] = secret;
  }
  return new NextRequest('http://localhost:3000/api/agent/data/eda', {
    method: 'POST',
    headers,
  });
}

describe('validateAgentRequest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when AGENT_SECRET is not set (secure by default)', () => {
    vi.stubEnv('AGENT_SECRET', '');
    const req = makeRequest();
    expect(validateAgentRequest(req)).toBe(false);
  });

  it('returns false when AGENT_SECRET is undefined', () => {
    delete process.env.AGENT_SECRET;
    const req = makeRequest();
    expect(validateAgentRequest(req)).toBe(false);
  });

  it('returns true when header matches AGENT_SECRET', () => {
    vi.stubEnv('AGENT_SECRET', 'my-secret-123');
    const req = makeRequest('my-secret-123');
    expect(validateAgentRequest(req)).toBe(true);
  });

  it('returns false when header does not match AGENT_SECRET', () => {
    vi.stubEnv('AGENT_SECRET', 'my-secret-123');
    const req = makeRequest('wrong-secret');
    expect(validateAgentRequest(req)).toBe(false);
  });

  it('returns false when header is missing but AGENT_SECRET is set', () => {
    vi.stubEnv('AGENT_SECRET', 'my-secret-123');
    const req = makeRequest(); // no header
    expect(validateAgentRequest(req)).toBe(false);
  });

  it('returns false when header length differs from secret', () => {
    vi.stubEnv('AGENT_SECRET', 'short');
    const req = makeRequest('a-much-longer-secret-value');
    expect(validateAgentRequest(req)).toBe(false);
  });
});
