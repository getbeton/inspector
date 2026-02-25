import type { NextRequest } from 'next/server'

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata
 *
 * Served via rewrite: /.well-known/oauth-authorization-server → here.
 * MCP clients discover this after receiving a 401 from the MCP endpoint.
 *
 * Security fixes:
 * - M2: Use NEXT_PUBLIC_APP_URL to avoid Host header injection
 * - M3: Remove scopes_supported (not enforced)
 * - L4: Add Cache-Control header
 */
export async function GET(request: NextRequest) {
  // M2 fix: Prefer configured APP_URL over request origin to prevent Host header injection
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  return Response.json(
    {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/api/mcp/authorize`,
      token_endpoint: `${baseUrl}/api/mcp/token`,
      registration_endpoint: `${baseUrl}/api/mcp/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      // M3 fix: Removed scopes_supported (not enforced server-side)
    },
    {
      // L4 fix: Cache-Control for metadata endpoint
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    }
  )
}
