import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { applyRateLimit, RATE_LIMITS } from '@/lib/utils/api-rate-limit'

/**
 * POST /api/mcp/register — Dynamic Client Registration (RFC 7591)
 *
 * MCP clients (Claude Code, Cursor, etc.) register themselves on first
 * connection to receive a client_id. This is a public endpoint — any
 * client can register because auth is enforced during the code exchange
 * via PKCE, not via client secrets.
 *
 * Security fixes:
 * - H1: Rate limited to 5 requests/min to prevent unbounded registration
 * - M4: Input sanitization via Zod schema
 */

const registerSchema = z.object({
  client_name: z.string().min(1).max(256),
  redirect_uris: z.array(z.string().url()).max(10).default([]),
})

export async function POST(request: Request) {
  // H1 fix: Strict rate limiting on registration endpoint
  const rateLimitResponse = applyRateLimit(request, 'mcp-register', RATE_LIMITS.STRICT)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const body = await request.json()

    // M4 fix: Validate and sanitize input with Zod
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: parsed.error.issues.map(i => i.message).join(', '),
        },
        { status: 400 }
      )
    }

    const { client_name, redirect_uris } = parsed.data
    const clientId = crypto.randomUUID()
    const admin = createAdminClient()

    const { error } = await (admin.from as any)('mcp_oauth_clients').insert({
      client_id: clientId,
      client_name,
      redirect_uris,
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
      redirect_uris,
      token_endpoint_auth_method: 'none',
    })
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Invalid JSON body' },
      { status: 400 }
    )
  }
}
