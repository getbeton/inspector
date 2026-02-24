import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * POST /api/mcp/token — OAuth 2.0 Token Endpoint
 *
 * Supports two grant types:
 * 1. authorization_code — exchanges an auth code + PKCE verifier for tokens
 * 2. refresh_token — exchanges a refresh token for fresh access + refresh tokens
 *
 * The access_token returned is a real Supabase JWT, so existing
 * createClientFromRequest() in API routes works unchanged.
 */
export async function POST(request: Request) {
  // MCP clients may send form-urlencoded or JSON
  const contentType = request.headers.get('content-type') || ''
  let params: Record<string, string>

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData()
    params = Object.fromEntries(formData.entries()) as Record<string, string>
  } else {
    params = (await request.json().catch(() => ({}))) as Record<string, string>
  }

  const grantType = params.grant_type

  if (grantType === 'authorization_code') {
    return handleAuthorizationCode(params)
  }

  if (grantType === 'refresh_token') {
    return handleRefreshToken(params)
  }

  return NextResponse.json(
    { error: 'unsupported_grant_type' },
    { status: 400 }
  )
}

// ─── Authorization Code Exchange ────────────────────────────────────────────

async function handleAuthorizationCode(params: Record<string, string>) {
  const { code, code_verifier, redirect_uri, client_id } = params

  if (!code || !code_verifier || !redirect_uri || !client_id) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing code, code_verifier, redirect_uri, or client_id' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Look up the auth code (must be unused)
  const { data: authCode } = await (admin.from as any)('mcp_auth_codes')
    .select('*')
    .eq('code', code)
    .is('used_at', null)
    .single()

  if (!authCode) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Invalid or already-used authorization code' },
      { status: 400 }
    )
  }

  // Check expiry
  if (new Date((authCode as Record<string, string>).expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Authorization code has expired' },
      { status: 400 }
    )
  }

  // Verify client_id and redirect_uri match what was used during authorization
  if (
    (authCode as Record<string, string>).client_id !== client_id ||
    (authCode as Record<string, string>).redirect_uri !== redirect_uri
  ) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'client_id or redirect_uri mismatch' },
      { status: 400 }
    )
  }

  // PKCE verification: S256 = base64url(sha256(code_verifier))
  const expectedChallenge = crypto
    .createHash('sha256')
    .update(code_verifier)
    .digest('base64url')

  if (expectedChallenge !== (authCode as Record<string, string>).code_challenge) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'PKCE code_verifier does not match code_challenge' },
      { status: 400 }
    )
  }

  // Mark code as used (single-use)
  await (admin.from as any)('mcp_auth_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code)

  // Return the Supabase session tokens as OAuth tokens
  return NextResponse.json({
    access_token: (authCode as Record<string, string>).access_token,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: (authCode as Record<string, string>).refresh_token,
  })
}

// ─── Refresh Token ──────────────────────────────────────────────────────────

async function handleRefreshToken(params: Record<string, string>) {
  const { refresh_token } = params

  if (!refresh_token) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing refresh_token' },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'server_error', error_description: 'Supabase not configured' },
      { status: 500 }
    )
  }

  // Create a stateless Supabase client to perform the refresh
  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token,
  })

  if (error || !data.session) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: error?.message || 'Refresh failed' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: data.session.refresh_token,
  })
}
