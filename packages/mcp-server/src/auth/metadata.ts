/**
 * OAuth Protected Resource Metadata (RFC 9728)
 *
 * Serves the /.well-known/oauth-protected-resource endpoint that tells
 * MCP clients where to authenticate. Points to Supabase as the
 * authorization server.
 */

import type { Request, Response } from 'express'

/**
 * Build the Protected Resource Metadata document.
 * This tells MCP clients:
 * - Where the resource server is (MCP_SERVER_URL)
 * - Where to get tokens (Supabase OAuth)
 */
export function getProtectedResourceMetadata(): Record<string, unknown> {
  const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3001'
  const supabaseUrl = process.env.SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is required')
  }

  return {
    resource: mcpServerUrl,
    authorization_servers: [supabaseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: [],
  }
}

/**
 * Express handler for GET /.well-known/oauth-protected-resource
 */
export function handleProtectedResourceMetadata(_req: Request, res: Response): void {
  try {
    const metadata = getProtectedResourceMetadata()
    res.json(metadata)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    res.status(500).json({ error: message })
  }
}
