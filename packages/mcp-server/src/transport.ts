/**
 * Express HTTP transport for MCP server
 *
 * Sets up the Express app with:
 * - POST /mcp — Streamable HTTP MCP transport
 * - GET /mcp — SSE connection for server-initiated messages
 * - DELETE /mcp — Session termination
 * - GET /.well-known/oauth-protected-resource — OAuth metadata
 * - GET /health — Health check
 *
 * Authentication is handled per-request: the transport extracts the
 * Authorization header and passes it to the context resolver.
 */

import express, { type Request, type Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { handleProtectedResourceMetadata } from './auth/metadata.js'
import { resolveContext, resolveAdminContext, AuthError } from './context/workspace.js'
import type { ToolContext, AdminToolContext } from './context/types.js'

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>()

/**
 * Create the Express application with MCP transport.
 *
 * @param createServer - Factory function that creates a configured McpServer
 */
export function createApp(
  createServer: (getContext: () => Promise<ToolContext>, getAdminContext: () => Promise<AdminToolContext>) => McpServer
): express.Express {
  const app = express()

  // Parse JSON bodies for MCP protocol messages
  app.use(express.json())

  // OAuth Protected Resource Metadata
  app.get('/.well-known/oauth-protected-resource', handleProtectedResourceMetadata)

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // MCP Streamable HTTP endpoint — handles POST, GET (SSE), DELETE
  app.post('/mcp', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization

    // Create context resolver closures that capture the auth header
    const getContext = () => resolveContext(authHeader)
    const getAdminContext = () => resolveAdminContext(authHeader)

    // Check for existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let transport: StreamableHTTPServerTransport

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport for this session
      transport = transports.get(sessionId)!
    } else if (!sessionId) {
      // New session — create transport and server
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport)
        },
      })

      // Clean up on close
      transport.onclose = () => {
        const id = transport.sessionId
        if (id) transports.delete(id)
      }

      const server = createServer(getContext, getAdminContext)
      await server.connect(transport)
    } else {
      // Session ID provided but not found — client needs to reconnect
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found. Please reconnect.' },
        id: null,
      })
      return
    }

    await transport.handleRequest(req, res, req.body)
  })

  // SSE endpoint for server-initiated messages
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !transports.has(sessionId)) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found' },
        id: null,
      })
      return
    }

    const transport = transports.get(sessionId)!
    await transport.handleRequest(req, res)
  })

  // Session termination
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !transports.has(sessionId)) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found' },
        id: null,
      })
      return
    }

    const transport = transports.get(sessionId)!
    await transport.handleRequest(req, res)
    transports.delete(sessionId)
  })

  return app
}
