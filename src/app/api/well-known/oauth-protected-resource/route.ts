import type { NextRequest } from 'next/server'

/**
 * RFC 9728 — OAuth Protected Resource Metadata
 *
 * Served via rewrite: /.well-known/oauth-protected-resource → here.
 * MCP clients fetch this after receiving a 401 from the MCP endpoint
 * to discover which authorization server to use.
 *
 * Security fixes:
 * - M2: Use NEXT_PUBLIC_APP_URL to avoid Host header injection
 * - M3: Remove scopes_supported (not enforced)
 * - L4: Add Cache-Control header
 */
export async function GET(request: NextRequest) {
  // M2 fix: Prefer configured APP_URL over request origin
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  return Response.json(
    {
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ['header'],
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
