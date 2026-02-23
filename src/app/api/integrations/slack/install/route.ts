/**
 * GET /api/integrations/slack/install
 *
 * Initiates the Slack OAuth V2 flow.
 * Generates an encrypted state parameter (CSRF + context), then redirects
 * the user to Slack's authorize page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { createOAuthState, buildAuthorizeUrl, getAppBaseUrl } from '@/lib/integrations/slack/oauth'

export async function GET(request: NextRequest) {
  try {
    const { user, workspaceId } = await requireWorkspace()

    // Determine where to return after OAuth (settings or setup wizard)
    const returnTo = request.nextUrl.searchParams.get('return_to') || undefined

    // Build encrypted state with workspace context
    const state = await createOAuthState({
      workspaceId,
      userId: user.id,
      returnTo,
    })

    // Build redirect URI — must match the one registered in Slack App settings
    const baseUrl = getAppBaseUrl()
    const redirectUri = `${baseUrl}/api/integrations/slack/callback`

    // Redirect to Slack authorize page
    const authorizeUrl = buildAuthorizeUrl(state, redirectUri)
    return NextResponse.redirect(authorizeUrl)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.redirect(new URL('/login', getAppBaseUrl()))
    }
    console.error('[Slack] Install error:', error)
    const baseUrl = getAppBaseUrl()
    return NextResponse.redirect(
      `${baseUrl}/settings?slack=error&message=${encodeURIComponent('Failed to start Slack OAuth flow')}`
    )
  }
}
