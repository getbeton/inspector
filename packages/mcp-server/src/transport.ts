/**
 * Express HTTP transport for MCP server
 *
 * Sets up the Express app with Streamable HTTP MCP transport.
 * Authentication is handled per-request: the transport extracts the
 * Authorization header and passes it to the tool proxy layer.
 *
 * SECURITY FIX: Auth headers are stored in a mutable Map and updated
 * on every request, preventing the stale closure bug where a token
 * captured at session creation would be reused for the session lifetime.
 */

import express, { type Request, type Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './server.js'

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>()

// Per-session mutable auth state — updated on every request
const sessionAuthHeaders = new Map<string, string | undefined>()

/**
 * Create the Express application with MCP transport.
 */
export function createApp(): express.Express {
  const app = express()

  app.use(express.json())

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // MCP Streamable HTTP endpoint
  app.post('/mcp', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let transport: StreamableHTTPServerTransport

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport — update the auth header (fixes stale closure)
      sessionAuthHeaders.set(sessionId, authHeader)
      transport = transports.get(sessionId)!
    } else if (!sessionId) {
      // New session — create transport and server
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport)
          sessionAuthHeaders.set(id, authHeader)
        },
      })

      // Clean up on close
      transport.onclose = () => {
        const id = transport.sessionId
        if (id) {
          transports.delete(id)
          sessionAuthHeaders.delete(id)
        }
      }

      // Create server with a getter that always reads the CURRENT auth header
      const getAuthHeader = () => {
        const id = transport.sessionId
        return id ? sessionAuthHeaders.get(id) : authHeader
      }

      const server = createMcpServer(getAuthHeader)
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
    sessionAuthHeaders.delete(sessionId)
  })

  return app
}
