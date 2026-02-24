/**
 * GET|POST|DELETE /mcp — Embedded MCP Streamable HTTP endpoint
 *
 * Dual-auth: supports both `beton_*` API keys (from settings page) and
 * Supabase JWTs (from OAuth login flow). Unauthenticated requests get 401
 * which triggers the MCP OAuth discovery flow in clients like Claude Code.
 *
 * Stateless — each request creates a fresh server + transport so there
 * is no session state to lose between Vercel function invocations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { validateApiKey } from '@/lib/mcp/validate-key'
import { registerAllTools } from '@/lib/mcp/tools'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function jsonRpcError(code: number, message: string, status: number, headers?: Record<string, string>) {
  return Response.json(
    { jsonrpc: '2.0', error: { code, message }, id: null },
    { status, headers }
  )
}

/**
 * Resolve workspace ID from a Bearer token. Supports two token types:
 * 1. `beton_*` API key → bcrypt-validated against api_keys table
 * 2. Supabase JWT → decoded to get user_id → workspace_members lookup
 */
async function resolveWorkspace(token: string): Promise<string | null> {
  // ── API key path ──────────────────────────────────────────────────
  if (token.startsWith('beton_')) {
    const auth = await validateApiKey(token)
    return auth?.workspaceId ?? null
  }

  // ── Supabase JWT path (from OAuth flow) ───────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Look up workspace membership via admin client (bypasses RLS)
  const admin = createAdminClient()
  const { data: member } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()

  return member?.workspace_id ?? null
}

async function handleMcp(request: Request): Promise<Response> {
  // ── Auth ────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    // 401 with WWW-Authenticate triggers MCP OAuth discovery in clients
    // resource_metadata URL tells mcp-remote where to find the protected
    // resource metadata (RFC 9728) which points to the authorization server.
    // Use request origin (not env vars) so it matches the domain the client connected to.
    const origin = new URL(request.url).origin

    return jsonRpcError(-32000, 'Authentication required', 401, {
      'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    })
  }

  const workspaceId = await resolveWorkspace(token)
  if (!workspaceId) {
    return jsonRpcError(-32000, 'Invalid or expired credentials', 401)
  }

  // ── Server + Transport ──────────────────────────────────────────────
  const server = new McpServer({
    name: 'beton',
    version: '0.2.0',
  })

  registerAllTools(server, workspaceId)

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
