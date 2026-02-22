/**
 * Error handling utilities for MCP tools
 *
 * Maps application errors to MCP-compatible error responses.
 * MCP tools return { content: [...], isError?: true } rather than throwing.
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { AuthError } from '../context/workspace.js'

/**
 * Convert any error into an MCP tool error response.
 * Returns the shape expected by MCP tool handlers.
 */
export function toMcpError(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message = error instanceof Error ? error.message : 'Unknown error'

  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  }
}

/**
 * Convert auth errors to proper MCP protocol errors.
 * These abort the request rather than returning a tool result.
 */
export function toMcpAuthError(error: unknown): McpError {
  if (error instanceof AuthError) {
    return new McpError(ErrorCode.InvalidRequest, error.message)
  }
  return new McpError(
    ErrorCode.InternalError,
    error instanceof Error ? error.message : 'Authentication failed'
  )
}
