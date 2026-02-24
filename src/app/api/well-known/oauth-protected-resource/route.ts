/**
 * RFC 9728 — OAuth Protected Resource Metadata
 *
 * Served via rewrite: /.well-known/oauth-protected-resource → here.
 * MCP clients fetch this after receiving a 401 from the MCP endpoint
 * to discover which authorization server to use.
 */
export async function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : 'http://localhost:3000')

  return Response.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:tools'],
  })
}
