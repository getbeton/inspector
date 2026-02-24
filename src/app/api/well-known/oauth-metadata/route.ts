import type { NextRequest } from 'next/server'

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata
 *
 * Served via rewrite: /.well-known/oauth-authorization-server → here.
 * MCP clients discover this after receiving a 401 from the MCP endpoint.
 *
 * Uses the request origin so URLs always match the domain the client connected to.
 */
export async function GET(request: NextRequest) {
  const baseUrl = new URL(request.url).origin

  return Response.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/mcp/authorize`,
    token_endpoint: `${baseUrl}/api/mcp/token`,
    registration_endpoint: `${baseUrl}/api/mcp/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp:tools'],
  })
}
