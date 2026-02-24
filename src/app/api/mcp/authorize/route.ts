import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * GET /api/mcp/authorize — OAuth 2.0 Authorization Endpoint
 *
 * Flow:
 * 1. MCP client opens this URL in user's browser with PKCE params
 * 2. If user isn't logged in → redirect to /login?next=<this URL>
 * 3. If user is logged in → generate auth code, redirect back to client
 *
 * The auth code contains a reference to the user's Supabase session tokens,
 * which the MCP client exchanges at /api/mcp/token.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)

  // --- Validate required OAuth params ---
  const responseType = url.searchParams.get('response_type')
  const clientId = url.searchParams.get('client_id')
  const redirectUri = url.searchParams.get('redirect_uri')
  const codeChallenge = url.searchParams.get('code_challenge')
  const codeChallengeMethod = url.searchParams.get('code_challenge_method')
  const state = url.searchParams.get('state')

  if (responseType !== 'code') {
    return NextResponse.json(
      { error: 'unsupported_response_type', error_description: 'Only "code" is supported' },
      { status: 400 }
    )
  }

  if (!clientId || !redirectUri || !codeChallenge || !state) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing required parameters: client_id, redirect_uri, code_challenge, state' },
      { status: 400 }
    )
  }

  if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Only S256 code_challenge_method is supported' },
      { status: 400 }
    )
  }

  // --- Check if user has an active Supabase session (cookie-based) ---
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    // No session → send to login, preserving all OAuth params for return
    const loginUrl = new URL('/login', url.origin)
    loginUrl.searchParams.set('next', `${url.pathname}${url.search}`)
    return NextResponse.redirect(loginUrl.toString())
  }

  // --- Validate client_id exists ---
  const admin = createAdminClient()
  const { data: client } = await (admin.from as any)('mcp_oauth_clients')
    .select('client_id, redirect_uris')
    .eq('client_id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'invalid_client' }, { status: 401 })
  }

  // --- Generate auth code and store with session tokens ---
  const code = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  const { error: insertError } = await (admin.from as any)('mcp_auth_codes').insert({
    code,
    client_id: clientId,
    user_id: session.user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod || 'S256',
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: expiresAt.toISOString(),
  })

  if (insertError) {
    console.error('[MCP Authorize] Failed to store auth code:', insertError.message)
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to generate authorization code' },
      { status: 500 }
    )
  }

  // --- Redirect back to MCP client with the code ---
  const callbackUrl = new URL(redirectUri)
  callbackUrl.searchParams.set('code', code)
  callbackUrl.searchParams.set('state', state)

  return NextResponse.redirect(callbackUrl.toString())
}
