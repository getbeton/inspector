/**
 * Slack OAuth V2 Helpers
 *
 * Handles encrypted state parameter generation/validation for CSRF protection.
 * State encodes { workspaceId, userId, returnTo, timestamp } encrypted with ENCRYPTION_KEY.
 */

import { encrypt, decrypt } from '@/lib/crypto/encryption'

const STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize'
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access'

/** Bot scopes required for signal notifications */
const BOT_SCOPES = [
  'chat:write',
  'chat:write.public',
  'channels:read',
  'groups:read',
].join(',')

// ── State Management ────────────────────────────────────────────

export interface OAuthStatePayload {
  workspaceId: string
  userId: string
  returnTo?: string
  timestamp: number
}

/**
 * Create an encrypted OAuth state parameter.
 * Encodes workspace/user context + timestamp for CSRF validation.
 */
export async function createOAuthState(payload: Omit<OAuthStatePayload, 'timestamp'>): Promise<string> {
  const statePayload: OAuthStatePayload = {
    ...payload,
    timestamp: Date.now(),
  }
  return encrypt(JSON.stringify(statePayload))
}

/**
 * Decrypt and validate an OAuth state parameter.
 * Checks timestamp expiry (10 minutes) and returns the payload.
 */
export async function validateOAuthState(state: string): Promise<OAuthStatePayload> {
  let payload: OAuthStatePayload
  try {
    const decrypted = await decrypt(state)
    payload = JSON.parse(decrypted) as OAuthStatePayload
  } catch {
    throw new OAuthError('Invalid or tampered OAuth state', 'invalid_state')
  }

  if (!payload.workspaceId || !payload.userId || !payload.timestamp) {
    throw new OAuthError('Malformed OAuth state payload', 'invalid_state')
  }

  const age = Date.now() - payload.timestamp
  if (age > STATE_MAX_AGE_MS) {
    throw new OAuthError(
      'OAuth state has expired. Please try connecting again.',
      'state_expired'
    )
  }

  return payload
}

// ── URL Builders ────────────────────────────────────────────────

/**
 * Build the Slack OAuth authorize URL with encoded state.
 */
export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) {
    throw new OAuthError('SLACK_CLIENT_ID is not configured', 'missing_config')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: BOT_SCOPES,
    redirect_uri: redirectUri,
    state,
  })

  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`
}

/**
 * Get the app's base URL (for redirect_uri construction).
 * Prefers NEXT_PUBLIC_APP_URL, falls back to NEXT_PUBLIC_VERCEL_URL.
 */
export function getAppBaseUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) return appUrl.replace(/\/$/, '')

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL
  if (vercelUrl) return `https://${vercelUrl}`

  return 'http://localhost:3000'
}

// ── Token Exchange ──────────────────────────────────────────────

export interface SlackOAuthTokenResponse {
  ok: boolean
  error?: string
  access_token?: string
  token_type?: string
  scope?: string
  bot_user_id?: string
  app_id?: string
  team?: { id: string; name: string }
  authed_user?: { id: string }
  is_enterprise_install?: boolean
}

/**
 * Exchange an OAuth code for a bot token.
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<SlackOAuthTokenResponse> {
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new OAuthError(
      'SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be configured',
      'missing_config'
    )
  }

  const response = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    throw new OAuthError(
      `Slack token exchange failed: HTTP ${response.status}`,
      'token_exchange_failed'
    )
  }

  const data = (await response.json()) as SlackOAuthTokenResponse

  if (!data.ok) {
    throw new OAuthError(
      `Slack OAuth error: ${data.error || 'unknown'}`,
      data.error || 'token_exchange_failed'
    )
  }

  return data
}

// ── Error ────────────────────────────────────────────────────────

export class OAuthError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'OAuthError'
    this.code = code
  }
}

// ── Constants Export ─────────────────────────────────────────────

/** All 20 signal types — default set enabled on fresh Slack connection */
export const ALL_SIGNAL_TYPES = [
  'usage_spike',
  'nearing_paywall',
  'director_signup',
  'invites_sent',
  'new_department_user',
  'high_nps',
  'trial_ending',
  'upcoming_renewal',
  'free_decision_maker',
  'upgrade_page_visit',
  'approaching_seat_limit',
  'overage',
  'usage_drop',
  'low_nps',
  'inactivity',
  'usage_wow_decline',
  'health_score_decrease',
  'arr_decrease',
  'incomplete_onboarding',
  'future_cancellation',
] as const
