/**
 * Express HTTP transport for MCP server
 *
 * Sets up the Express app with Streamable HTTP MCP transport.
 * Authentication is handled per-request: the transport extracts the
 * Authorization header and passes it to the tool proxy layer.
 *
 * Security fixes:
 * - H7: Session capacity cap + idle TTL sweep (prevents OOM)
 * - H8: Rate limiting (60 req/min per IP)
 * - M15: Auth hash pinning per session (prevents session hijacking)
 * - M17: Auth required on GET/DELETE (SSE/session termination)
 * - L8: Body size limit (16kb)
 */

import express, { type Request, type Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './server.js'
import rateLimit from 'express-rate-limit'
import crypto from 'crypto'

// ─── Session management ──────────────────────────────────────────────────────

const MAX_SESSIONS = 100
const SESSION_IDLE_TTL_MS = 30 * 60 * 1000 // 30 minutes

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>()

// Per-session mutable auth state — updated on every request
const sessionAuthHeaders = new Map<string, string | undefined>()

// Per-session auth hash — prevents session hijacking (M15)
const sessionAuthHashes = new Map<string, string>()

// Per-session last activity — for idle sweep
const sessionLastActivity = new Map<string, number>()

/**
 * Hash an auth header for comparison (not storage of the token itself)
 */
function hashAuth(authHeader: string | undefined): string {
  if (!authHeader) return ''
  return crypto.createHash('sha256').update(authHeader).digest('hex').substring(0, 16)
}

/**
 * Clean up a session and all its associated state
 */
function cleanupSession(sessionId: string): void {
  const transport = transports.get(sessionId)
  transports.delete(sessionId)
  sessionAuthHeaders.delete(sessionId)
  sessionAuthHashes.delete(sessionId)
  sessionLastActivity.delete(sessionId)
  if (transport) {
    try { if (transport.onclose) transport.onclose() } catch { /* ignore */ }
  }
}

/**
 * Sweep idle sessions that haven't been used within the TTL
 */
function sweepIdleSessions(): void {
  const now = Date.now()
  for (const [sessionId, lastActivity] of sessionLastActivity.entries()) {
    if (now - lastActivity > SESSION_IDLE_TTL_MS) {
      cleanupSession(sessionId)
    }
  }
}

// Sweep every 5 minutes
setInterval(sweepIdleSessions, 5 * 60 * 1000).unref()

// ─── Express app ─────────────────────────────────────────────────────────────

/**
 * Create the Express application with MCP transport.
 */
export function createApp(): express.Express {
  const app = express()

  // L8 fix: Body size limit
  app.use(express.json({ limit: '16kb' }))

  // H8 fix: Rate limiting (60 req/min per IP)
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Too many requests' },
      id: null,
    },
  }))

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // MCP Streamable HTTP endpoint
  app.post('/mcp', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let transport: StreamableHTTPServerTransport

    // No auth on a fresh connection → 401 to trigger MCP OAuth flow
    if (!authHeader && !sessionId) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Authentication required' },
        id: null,
      })
      return
    }

    if (sessionId && transports.has(sessionId)) {
      // M15 fix: Verify auth hash matches the session creator
      const expectedHash = sessionAuthHashes.get(sessionId)
      const currentHash = hashAuth(authHeader)
      if (expectedHash && currentHash !== expectedHash) {
        res.status(403).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session auth mismatch' },
          id: null,
        })
        return
      }

      // Reuse existing transport — update the auth header (fixes stale closure)
      sessionAuthHeaders.set(sessionId, authHeader)
      sessionLastActivity.set(sessionId, Date.now())
      transport = transports.get(sessionId)!
    } else if (!sessionId) {
      // H7 fix: Check session capacity before creating a new one
      if (transports.size >= MAX_SESSIONS) {
        // Try sweeping idle sessions first
        sweepIdleSessions()
        if (transports.size >= MAX_SESSIONS) {
          res.status(503).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Server session capacity reached. Please try again later.' },
            id: null,
          })
          return
        }
      }

      // New session — create transport and server
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport)
          sessionAuthHeaders.set(id, authHeader)
          sessionAuthHashes.set(id, hashAuth(authHeader))
          sessionLastActivity.set(id, Date.now())
        },
      })

      // Clean up on close
      transport.onclose = () => {
        const id = transport.sessionId
        if (id) {
          cleanupSession(id)
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
  // M17 fix: Require auth on GET
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const authHeader = req.headers.authorization

    if (!sessionId || !transports.has(sessionId)) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found' },
        id: null,
      })
      return
    }

    // M17 + M15 fix: Verify auth matches session
    const expectedHash = sessionAuthHashes.get(sessionId)
    if (expectedHash && hashAuth(authHeader) !== expectedHash) {
      res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Authentication required' },
        id: null,
      })
      return
    }

    sessionLastActivity.set(sessionId, Date.now())
    const transport = transports.get(sessionId)!
    await transport.handleRequest(req, res)
  })

  // Session termination
  // M17 fix: Require auth on DELETE
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const authHeader = req.headers.authorization

    if (!sessionId || !transports.has(sessionId)) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found' },
        id: null,
      })
      return
    }

    // M17 + M15 fix: Verify auth matches session
    const expectedHash = sessionAuthHashes.get(sessionId)
    if (expectedHash && hashAuth(authHeader) !== expectedHash) {
      res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Authentication required' },
        id: null,
      })
      return
    }

    const transport = transports.get(sessionId)!
    await transport.handleRequest(req, res)
    cleanupSession(sessionId)
  })

  return app
}
