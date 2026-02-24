import type { NextRequest } from 'next/server'

/**
 * RFC 9728 — OAuth Protected Resource Metadata
 *
 * Served via rewrite: /.well-known/oauth-protected-resource → here.
 * MCP clients fetch this after receiving a 401 from the MCP endpoint
 * to discover which authorization server to use.
 *
 * Uses the request origin (not env vars) so URLs always match the domain
 * the MCP client actually connected to.
 */
export async function GET(request: NextRequest) {
  const baseUrl = new URL(request.url).origin

  return Response.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:tools'],
  })
}
