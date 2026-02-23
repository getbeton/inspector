/**
 * GET /api/integrations/slack/callback
 *
 * OAuth V2 callback handler. Slack redirects here after the user authorizes.
 * Validates CSRF state, exchanges the code for a bot token, encrypts and
 * stores the token in integration_configs, then redirects to settings or setup.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptCredentials } from '@/lib/crypto/encryption'
import {
  validateOAuthState,
  exchangeCodeForToken,
  getAppBaseUrl,
  OAuthError,
  ALL_SIGNAL_TYPES,
} from '@/lib/integrations/slack/oauth'
import type { SlackConfigJson } from '@/lib/integrations/slack/types'

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl()

  try {
    // ── Extract query params ──────────────────────────────────
    const { searchParams } = request.nextUrl
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const slackError = searchParams.get('error')

    // Slack sends ?error=access_denied if user cancels
    if (slackError) {
      return redirectWithError(baseUrl, state, `Slack authorization was denied: ${slackError}`)
    }

    if (!code || !state) {
      return redirectWithError(baseUrl, state, 'Missing code or state from Slack callback')
    }

    // ── Validate CSRF state ───────────────────────────────────
    const payload = await validateOAuthState(state)

    // ── Exchange code for token ───────────────────────────────
    const redirectUri = `${baseUrl}/api/integrations/slack/callback`
    const tokenData = await exchangeCodeForToken(code, redirectUri)

    if (!tokenData.access_token) {
      return redirectWithError(baseUrl, state, 'No access token received from Slack')
    }

    // ── Encrypt and store credentials ─────────────────────────
    const { apiKeyEncrypted } = await encryptCredentials({
      apiKey: tokenData.access_token,
    })

    const configJson: SlackConfigJson = {
      slack_team_id: tokenData.team?.id,
      slack_team_name: tokenData.team?.name,
      slack_bot_user_id: tokenData.bot_user_id,
      installed_by_slack_user_id: tokenData.authed_user?.id,
      enabled_signal_types: [...ALL_SIGNAL_TYPES],
    }

    const supabase = await createClient()

    // Upsert: create or update the Slack integration config
    const configData = {
      workspace_id: payload.workspaceId,
      integration_name: 'slack',
      api_key_encrypted: apiKeyEncrypted,
      project_id_encrypted: null,
      config_json: configJson as unknown as Record<string, unknown>,
      status: 'connected' as const,
      is_active: true,
      last_validated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase
      .from('integration_configs')
      .upsert(configData as never, {
        onConflict: 'workspace_id,integration_name',
      })

    if (upsertError) {
      console.error('[Slack] Failed to store credentials:', upsertError)
      return redirectWithError(baseUrl, state, 'Failed to save Slack connection')
    }

    // ── Redirect to success page ──────────────────────────────
    const returnTo = payload.returnTo
    if (returnTo === 'setup') {
      return NextResponse.redirect(`${baseUrl}/setup?step=slack&slack=connected`)
    }
    return NextResponse.redirect(`${baseUrl}/settings?slack=connected`)
  } catch (error) {
    console.error('[Slack] OAuth callback error:', error)

    if (error instanceof OAuthError) {
      return redirectWithError(baseUrl, null, error.message)
    }

    return redirectWithError(baseUrl, null, 'An unexpected error occurred during Slack connection')
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function redirectWithError(baseUrl: string, state: string | null, message: string): NextResponse {
  // Try to determine return destination from state
  let destination = '/settings'
  if (state) {
    try {
      // Best-effort: if state is still valid, use returnTo
      // Don't await — this is a sync redirect helper
    } catch {
      // Ignore — default to settings
    }
  }
  return NextResponse.redirect(
    `${baseUrl}${destination}?slack=error&message=${encodeURIComponent(message)}`
  )
}
