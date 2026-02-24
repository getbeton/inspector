import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * POST /api/mcp/register — Dynamic Client Registration (RFC 7591)
 *
 * MCP clients (Claude Code, Cursor, etc.) register themselves on first
 * connection to receive a client_id. This is a public endpoint — any
 * client can register because auth is enforced during the code exchange
 * via PKCE, not via client secrets.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { client_name, redirect_uris } = body

    if (!client_name) {
      return NextResponse.json(
        { error: 'invalid_client_metadata', error_description: 'client_name is required' },
        { status: 400 }
      )
    }

    const clientId = crypto.randomUUID()
    const admin = createAdminClient()

    const { error } = await (admin.from as any)('mcp_oauth_clients').insert({
      client_id: clientId,
      client_name,
      redirect_uris: redirect_uris || [],
    })

    if (error) {
      console.error('[MCP Register] Insert failed:', error.message)
      return NextResponse.json(
        { error: 'server_error', error_description: 'Registration failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      client_id: clientId,
      client_name,
      redirect_uris: redirect_uris || [],
      token_endpoint_auth_method: 'none',
    })
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Invalid JSON body' },
      { status: 400 }
    )
  }
}
