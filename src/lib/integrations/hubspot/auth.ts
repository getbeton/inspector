/**
 * HubSpot Authentication Module
 *
 * Handles OAuth 2.0 flow and Private App Token validation for HubSpot CRM.
 *
 * OAuth flow:
 *   1. getAuthorizeUrl() → redirect user to HubSpot
 *   2. exchangeCodeForTokens() → exchange auth code for tokens
 *   3. refreshAccessToken() → refresh expired access tokens
 *
 * Private App:
 *   1. validatePrivateAppToken() → format validation (starts with 'pat-')
 */

import type { HubSpotOAuthTokens } from './types'

const HUBSPOT_OAUTH_BASE = 'https://app.hubspot.com/oauth/authorize'
const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token'

// ============================================
// OAuth Flow
// ============================================

/**
 * Build the HubSpot OAuth authorization URL.
 *
 * @param clientId - HubSpot app client ID
 * @param redirectUri - Callback URL after authorization
 * @param scopes - Requested OAuth scopes
 * @param state - CSRF state parameter
 * @returns Full authorization URL
 */
export function getAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    response_type: 'code',
  })

  return `${HUBSPOT_OAUTH_BASE}?${params.toString()}`
}

/**
 * Exchange an authorization code for access and refresh tokens.
 *
 * @param code - Authorization code from HubSpot callback
 * @param clientId - HubSpot app client ID
 * @param clientSecret - HubSpot app client secret
 * @param redirectUri - Must match the redirect_uri used in the authorize request
 * @returns OAuth tokens (access_token, refresh_token, expires_in)
 * @throws Error if token exchange fails
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<HubSpotOAuthTokens> {
  const response = await fetch(HUBSPOT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`HubSpot token exchange failed (${response.status}): ${errorBody}`)
  }

  return response.json()
}

/**
 * Refresh an expired access token using a refresh token.
 *
 * @param refreshToken - The refresh token from initial authorization
 * @param clientId - HubSpot app client ID
 * @param clientSecret - HubSpot app client secret
 * @returns New OAuth tokens (access_token, refresh_token, expires_in)
 * @throws Error if refresh fails
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<HubSpotOAuthTokens> {
  const response = await fetch(HUBSPOT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`HubSpot token refresh failed (${response.status}): ${errorBody}`)
  }

  return response.json()
}

// ============================================
// Private App Token Validation
// ============================================

/**
 * Validate a HubSpot Private App token format.
 *
 * Private App tokens:
 * - Must start with 'pat-' prefix
 * - Must be at least 20 characters long
 *
 * @param token - The Private App token to validate
 * @returns Object with valid flag and optional error message
 */
export function validatePrivateAppToken(token: string): {
  valid: boolean
  error?: string
} {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' }
  }

  const trimmed = token.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Token cannot be empty' }
  }

  if (!trimmed.startsWith('pat-')) {
    return {
      valid: false,
      error: 'HubSpot Private App token must start with "pat-"',
    }
  }

  if (trimmed.length < 20) {
    return {
      valid: false,
      error: 'HubSpot Private App token appears too short',
    }
  }

  return { valid: true }
}

// ============================================
// Token Expiry Check
// ============================================

/**
 * Check if an OAuth access token has expired or will expire soon.
 *
 * @param expiresAt - Token expiry timestamp (ISO 8601 or Date)
 * @param bufferMinutes - Minutes of buffer before actual expiry (default: 5)
 * @returns true if the token is expired or will expire within the buffer period
 */
export function isTokenExpired(
  expiresAt: string | Date | null | undefined,
  bufferMinutes: number = 5
): boolean {
  if (!expiresAt) {
    return true
  }

  const expiryTime = new Date(expiresAt).getTime()
  const now = Date.now()
  const bufferMs = bufferMinutes * 60 * 1000

  return now >= expiryTime - bufferMs
}
