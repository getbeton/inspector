/**
 * GET /api/integrations/hubspot/oauth/callback
 *
 * Handles the OAuth callback from HubSpot after user authorization.
 * Exchanges the authorization code for tokens, encrypts and stores them,
 * fetches account info, and updates the connection status.
 *
 * Query params (from HubSpot redirect):
 *   - code: Authorization code
 *   - state: CSRF state parameter (workspace_id:token)
 *
 * On success: redirects to /settings with success indicator
 * On error: redirects to /settings with error details
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens } from '@/lib/integrations/hubspot/auth'
import { encrypt } from '@/lib/crypto/encryption'
import { HUBSPOT_API_BASE } from '@/lib/integrations/hubspot/config'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot OAuth Callback]')

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  // Build redirect base URL
  const settingsUrl = `${url.protocol}//${url.host}/settings`

  // Handle HubSpot error (user denied, etc.)
  if (error) {
    log.warn('OAuth error from HubSpot:', error, errorDescription)
    return NextResponse.redirect(
      `${settingsUrl}?hubspot_error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  // Validate required params
  if (!code || !state) {
    return NextResponse.redirect(
      `${settingsUrl}?hubspot_error=${encodeURIComponent('Missing authorization code or state')}`
    )
  }

  // Parse state to extract workspace ID
  const stateParts = state.split(':')
  if (stateParts.length !== 2) {
    return NextResponse.redirect(
      `${settingsUrl}?hubspot_error=${encodeURIComponent('Invalid state parameter')}`
    )
  }

  const [workspaceId] = stateParts

  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        `${settingsUrl}?hubspot_error=${encodeURIComponent('Not authenticated')}`
      )
    }

    // Find the pending connection with matching state
    const { data: connection, error: findError } = await supabase
      .from('hubspot_connections')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('oauth_state', state)
      .eq('status', 'pending')
      .single()

    if (findError || !connection) {
      log.error('No pending connection found for state:', findError)
      return NextResponse.redirect(
        `${settingsUrl}?hubspot_error=${encodeURIComponent('OAuth session expired or invalid. Please try again.')}`
      )
    }

    // Exchange code for tokens
    const clientId = process.env.HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      log.error('Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET')
      return NextResponse.redirect(
        `${settingsUrl}?hubspot_error=${encodeURIComponent('HubSpot OAuth not configured on server')}`
      )
    }

    const redirectUri =
      process.env.HUBSPOT_REDIRECT_URI ||
      `${url.protocol}//${url.host}/api/integrations/hubspot/oauth/callback`

    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri)

    // Encrypt tokens
    const [accessTokenEncrypted, refreshTokenEncrypted] = await Promise.all([
      encrypt(tokens.access_token),
      encrypt(tokens.refresh_token),
    ])

    // Calculate token expiry
    const tokenExpiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString()

    // Fetch account info from HubSpot
    let hubId: string | null = null
    let hubDomain: string | null = null
    let accountName: string | null = null

    try {
      const accountInfoResponse = await fetch(
        `${HUBSPOT_API_BASE}/account-info/v3/details`,
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        }
      )

      if (accountInfoResponse.ok) {
        const accountInfo = await accountInfoResponse.json()
        hubId = String(accountInfo.portalId)
        hubDomain = accountInfo.uiDomain || null
        accountName = accountInfo.accountType || null
      }
    } catch (err) {
      log.warn('Failed to fetch HubSpot account info:', err)
      // Non-critical — continue with connection setup
    }

    // Update connection with tokens and account info
    const { error: updateError } = await supabase
      .from('hubspot_connections')
      .update({
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: tokenExpiresAt,
        hub_id: hubId,
        hub_domain: hubDomain,
        account_name: accountName,
        oauth_state: null, // Clear the state
        status: 'connected',
        is_active: true,
        is_primary: true, // First OAuth connection becomes primary
        last_validated_at: new Date().toISOString(),
      } as never)
      .eq('id', (connection as Record<string, string>).id)

    if (updateError) {
      log.error('Failed to update connection with tokens:', updateError)
      return NextResponse.redirect(
        `${settingsUrl}?hubspot_error=${encodeURIComponent('Failed to save connection. Please try again.')}`
      )
    }

    log.info(`HubSpot OAuth connected for workspace ${workspaceId}, hub ${hubId}`)

    return NextResponse.redirect(`${settingsUrl}?hubspot_connected=true`)
  } catch (err) {
    log.error('OAuth callback error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(
      `${settingsUrl}?hubspot_error=${encodeURIComponent(message)}`
    )
  }
}
