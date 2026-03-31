/**
 * GET /api/integrations/hubspot/oauth/authorize
 *
 * Initiates the HubSpot OAuth flow by redirecting the user to HubSpot's
 * authorization page. Generates a CSRF state parameter and stores it
 * in the database for verification during callback.
 *
 * Query params:
 *   - connection_name (optional): Name for the new connection
 *
 * Requires:
 *   - HUBSPOT_CLIENT_ID env var
 *   - HUBSPOT_REDIRECT_URI env var (or constructs from request URL)
 */

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { getAuthorizeUrl } from '@/lib/integrations/hubspot/auth'
import { DEFAULT_OAUTH_SCOPES } from '@/lib/integrations/hubspot/config'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot OAuth Authorize]')

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get workspace
    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Check required env vars
    const clientId = process.env.HUBSPOT_CLIENT_ID
    if (!clientId) {
      log.error('HUBSPOT_CLIENT_ID not configured')
      return NextResponse.json(
        { error: 'HubSpot OAuth is not configured on this server' },
        { status: 503 }
      )
    }

    // Build redirect URI
    const url = new URL(request.url)
    const redirectUri =
      process.env.HUBSPOT_REDIRECT_URI ||
      `${url.protocol}//${url.host}/api/integrations/hubspot/oauth/callback`

    // Parse optional connection name
    const connectionName = url.searchParams.get('connection_name') || 'HubSpot'

    // Generate CSRF state (includes workspace ID for callback verification)
    const stateToken = randomBytes(32).toString('hex')
    const state = `${membership.workspaceId}:${stateToken}`

    // Create a pending connection row with the state for callback verification
    const { error: insertError } = await supabase
      .from('hubspot_connections')
      .insert({
        workspace_id: membership.workspaceId,
        name: connectionName,
        auth_type: 'oauth',
        oauth_state: state,
        status: 'pending',
      } as never)

    if (insertError) {
      log.error('Failed to create pending connection:', insertError)
      return NextResponse.json(
        { error: 'Failed to initiate OAuth flow' },
        { status: 500 }
      )
    }

    // Build authorization URL and redirect
    const authorizeUrl = getAuthorizeUrl(
      clientId,
      redirectUri,
      DEFAULT_OAUTH_SCOPES,
      state
    )

    return NextResponse.redirect(authorizeUrl)
  } catch (error) {
    log.error('OAuth authorize error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
