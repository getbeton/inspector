import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { registerAllTools } from '@/lib/mcp/tools'
import type { NextRequest } from 'next/server'

/**
 * Streamable HTTP MCP endpoint — POST /mcp
 *
 * Stateless: each request creates a fresh McpServer, processes the
 * JSON-RPC message, and returns the response. No sessions needed —
 * works natively on Vercel serverless.
 *
 * Auth: returns 401 without Bearer token, triggering the MCP OAuth
 * discovery flow (/.well-known/oauth-authorization-server).
 */

// ─── Inline Transport ───────────────────────────────────────────────────────
// Bridges McpServer ↔ Next.js Request/Response in a single round-trip.

class InlineTransport implements Transport {
  onmessage?: (message: JSONRPCMessage) => void
  onerror?: (error: Error) => void
  onclose?: () => void
  sessionId?: string

  private collected: JSONRPCMessage[] = []
  private resolver?: () => void

  async start(): Promise<void> {}
  async close(): Promise<void> { this.onclose?.() }

  async send(message: JSONRPCMessage): Promise<void> {
    this.collected.push(message)
    this.resolver?.()
  }

  /** Feed a JSON-RPC message and collect the server's response(s). */
  async handle(message: JSONRPCMessage): Promise<JSONRPCMessage | null> {
    this.collected = []

    // Dispatch to the McpServer via the onmessage callback
    this.onmessage?.(message)

    // Notifications (no `id`) don't produce responses
    if (!('id' in message)) {
      return null
    }

    // Wait for the server to call send()
    if (this.collected.length === 0) {
      await new Promise<void>((resolve) => {
        this.resolver = resolve
      })
    }

    return this.collected[0] ?? null
  }
}

// ─── Route Handler ──────────────────────────────────────────────────────────

/**
 * Synthetic initialize handshake sent before every non-initialize request.
 * In stateless mode each POST creates a fresh McpServer that hasn't seen
 * the client's initialize → we replay it internally so tools/list and
 * tools/call work without a persistent session.
 */
const SYNTHETIC_INIT: JSONRPCMessage = {
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'stateless-bridge', version: '1.0' },
  },
  id: '_init',
} as unknown as JSONRPCMessage

const SYNTHETIC_INITIALIZED: JSONRPCMessage = {
  jsonrpc: '2.0',
  method: 'notifications/initialized',
} as unknown as JSONRPCMessage

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  // No token → 401 triggers MCP OAuth flow in the client
  if (!authHeader) {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Authentication required' },
        id: null,
      },
      {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
      }
    )
  }

  // Parse JSON-RPC body
  let body: JSONRPCMessage
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null },
      { status: 400 }
    )
  }

  // Create a fresh server + transport per request (stateless)
  const transport = new InlineTransport()
  const server = new McpServer({ name: 'beton', version: '0.2.0' })
  registerAllTools(server, () => authHeader)
  await server.connect(transport)

  // For non-initialize requests, replay the handshake so the server
  // accepts tools/list, tools/call, etc. on this fresh instance.
  const method = (body as { method?: string }).method
  if (method !== 'initialize') {
    await transport.handle(SYNTHETIC_INIT)
    await transport.handle(SYNTHETIC_INITIALIZED)
  }

  const response = await transport.handle(body)

  // Clean up
  await server.close()

  if (!response) {
    // Notification acknowledged — no body needed
    return new Response(null, { status: 202 })
  }

  return Response.json(response)
}

// GET /mcp — SSE stream (not needed for stateless, return method not allowed)
export async function GET() {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'SSE not supported in stateless mode' }, id: null },
    { status: 405 }
  )
}

// DELETE /mcp — session termination (no-op for stateless)
export async function DELETE() {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'No sessions in stateless mode' }, id: null },
    { status: 405 }
  )
}
