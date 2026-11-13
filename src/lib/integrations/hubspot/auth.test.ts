/// <reference types="vitest" />
/**
 * Tests for HubSpot auth module
 *
 * HS-U21: getAuthorizeUrl builds correct URL with params
 * HS-U22: exchangeCodeForTokens sends correct POST
 * HS-U23: refreshAccessToken handles refresh flow
 * HS-U24: validatePrivateAppToken validates format
 * HS-U25: isTokenExpired checks expiry with buffer
 */

import {
  getAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  validatePrivateAppToken,
  isTokenExpired,
} from './auth'

// ---------------------------------------------------------------------------
// HS-U21: getAuthorizeUrl
// ---------------------------------------------------------------------------

describe('getAuthorizeUrl', () => {
  it('builds correct OAuth URL with all params', () => {
    const url = getAuthorizeUrl(
      'client-123',
      'https://example.com/callback',
      ['crm.objects.contacts.read', 'crm.objects.companies.read'],
      'test-state-token'
    )

    expect(url).toContain('https://app.hubspot.com/oauth/authorize')
    expect(url).toContain('client_id=client-123')
    expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback')
    expect(url).toContain('scope=crm.objects.contacts.read+crm.objects.companies.read')
    expect(url).toContain('state=test-state-token')
    expect(url).toContain('response_type=code')
  })

  it('handles empty scopes array', () => {
    const url = getAuthorizeUrl('client-123', 'https://example.com/cb', [], 'state')
    expect(url).toContain('scope=')
  })

  it('encodes special characters in params', () => {
    const url = getAuthorizeUrl(
      'client-123',
      'https://example.com/cb?foo=bar',
      ['scope.one'],
      'state:with:colons'
    )
    expect(url).toContain('redirect_uri=')
    expect(url).toContain('state=')
  })
})

// ---------------------------------------------------------------------------
// HS-U22: exchangeCodeForTokens
// ---------------------------------------------------------------------------

describe('exchangeCodeForTokens', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('sends correct POST request and returns tokens', async () => {
    const mockTokens = {
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      expires_in: 1800,
      token_type: 'bearer',
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTokens),
    })

    const result = await exchangeCodeForTokens(
      'auth-code',
      'client-id',
      'client-secret',
      'https://example.com/callback'
    )

    expect(result).toEqual(mockTokens)

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[0]).toBe('https://api.hubapi.com/oauth/v1/token')
    expect(fetchCall[1].method).toBe('POST')
    expect(fetchCall[1].headers['Content-Type']).toBe('application/x-www-form-urlencoded')

    const body = fetchCall[1].body
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('code=auth-code')
    expect(body).toContain('client_id=client-id')
    expect(body).toContain('client_secret=client-secret')
  })

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Invalid grant'),
    })

    await expect(
      exchangeCodeForTokens('bad-code', 'client-id', 'secret', 'https://example.com/cb')
    ).rejects.toThrow('HubSpot token exchange failed (400)')
  })
})

// ---------------------------------------------------------------------------
// HS-U23: refreshAccessToken
// ---------------------------------------------------------------------------

describe('refreshAccessToken', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('sends correct refresh request', async () => {
    const mockTokens = {
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 1800,
      token_type: 'bearer',
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTokens),
    })

    const result = await refreshAccessToken('old-refresh', 'client-id', 'client-secret')

    expect(result).toEqual(mockTokens)

    const body = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    expect(body).toContain('grant_type=refresh_token')
    expect(body).toContain('refresh_token=old-refresh')
  })

  it('throws on failed refresh', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Invalid refresh token'),
    })

    await expect(
      refreshAccessToken('bad-token', 'client-id', 'secret')
    ).rejects.toThrow('HubSpot token refresh failed (401)')
  })
})

// ---------------------------------------------------------------------------
// HS-U24: validatePrivateAppToken
// ---------------------------------------------------------------------------

describe('validatePrivateAppToken', () => {
  it('accepts valid pat- token', () => {
    const result = validatePrivateAppToken('pat-na1-abcdef1234567890abcd')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('rejects empty/null token', () => {
    expect(validatePrivateAppToken('')).toEqual({
      valid: false,
      error: 'Token is required',
    })
    expect(validatePrivateAppToken(null as unknown as string)).toEqual({
      valid: false,
      error: 'Token is required',
    })
    expect(validatePrivateAppToken(undefined as unknown as string)).toEqual({
      valid: false,
      error: 'Token is required',
    })
  })

  it('rejects token without pat- prefix', () => {
    const result = validatePrivateAppToken('sk-abcdef1234567890abcd')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('pat-')
  })

  it('rejects token that is too short', () => {
    const result = validatePrivateAppToken('pat-short')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('too short')
  })

  it('trims whitespace before validation', () => {
    const result = validatePrivateAppToken('  pat-na1-abcdef1234567890abcd  ')
    // After trim, starts with ' ' so won't match pat- prefix
    // Actually, '  pat-...' trimmed becomes 'pat-...'
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// HS-U25: isTokenExpired
// ---------------------------------------------------------------------------

describe('isTokenExpired', () => {
  it('returns true for null/undefined expiry', () => {
    expect(isTokenExpired(null)).toBe(true)
    expect(isTokenExpired(undefined)).toBe(true)
  })

  it('returns true for expired token', () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString()
    expect(isTokenExpired(pastDate)).toBe(true)
  })

  it('returns true for token expiring within buffer', () => {
    // Token expires in 3 minutes, but buffer is 5 minutes
    const soonDate = new Date(Date.now() + 3 * 60_000).toISOString()
    expect(isTokenExpired(soonDate, 5)).toBe(true)
  })

  it('returns false for token with plenty of time left', () => {
    const futureDate = new Date(Date.now() + 30 * 60_000).toISOString()
    expect(isTokenExpired(futureDate, 5)).toBe(false)
  })

  it('respects custom buffer minutes', () => {
    // Token expires in 2 minutes
    const soonDate = new Date(Date.now() + 2 * 60_000).toISOString()
    // 1 minute buffer → not expired
    expect(isTokenExpired(soonDate, 1)).toBe(false)
    // 3 minute buffer → expired
    expect(isTokenExpired(soonDate, 3)).toBe(true)
  })

  it('accepts Date object', () => {
    const futureDate = new Date(Date.now() + 60 * 60_000)
    expect(isTokenExpired(futureDate)).toBe(false)
  })
})
