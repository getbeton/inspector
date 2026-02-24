/**
 * GET|POST|DELETE /mcp
 *
 * Embedded MCP endpoint using the Streamable HTTP transport (Web Standard).
 * Authenticates via `Authorization: Bearer beton_xxx` API keys.
 *
 * Stateless mode — each request creates a fresh server + transport so there
 * is no session state to lose between Vercel function invocations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { validateApiKey } from '@/lib/mcp/validate-key'
import { registerAllTools } from '@/lib/mcp/tools'

function jsonRpcError(code: number, message: string, status: number) {
  return Response.json(
    { jsonrpc: '2.0', error: { code, message }, id: null },
    { status }
  )
}

async function handleMcp(request: Request): Promise<Response> {
  // ── Auth ────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!apiKey) {
    return jsonRpcError(-32000, 'Missing Authorization: Bearer <api_key> header', 401)
  }

  const auth = await validateApiKey(apiKey)
  if (!auth) {
    return jsonRpcError(-32000, 'Invalid or expired API key', 401)
  }

  // ── Server + Transport ──────────────────────────────────────────────
  const server = new McpServer({
    name: 'beton',
    version: '0.2.0',
  })

  registerAllTools(server, auth.workspaceId)

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no session ID, each request is independent
    sessionIdGenerator: undefined,
    // Return JSON instead of SSE for simpler tool call responses
    enableJsonResponse: true,
  })

  await server.connect(transport)

  // ── Handle request ──────────────────────────────────────────────────
  // Pre-parse body for POST so the transport doesn't re-read the stream
  let parsedBody: unknown
  if (request.method === 'POST') {
    try {
      parsedBody = await request.json()
    } catch {
      return jsonRpcError(-32700, 'Parse error: invalid JSON', 400)
    }
  }

  return transport.handleRequest(request, { parsedBody })
}

export async function POST(request: Request) {
  return handleMcp(request)
}

export async function GET(request: Request) {
  return handleMcp(request)
}

export async function DELETE(request: Request) {
  return handleMcp(request)
}
