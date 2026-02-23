/**
 * Error handling utilities for MCP tools
 *
 * Maps application errors and HTTP statuses to MCP-compatible responses.
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'

/**
 * Convert any error into an MCP tool error response.
 */
export function toMcpError(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message = error instanceof Error ? error.message : 'Unknown error'

  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  }
}

/**
 * Convert an HTTP error response from the API into an MCP tool error.
 */
export function httpErrorToMcp(
  data: unknown,
  status: number
): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const body = data as Record<string, unknown> | null
  const message = (body?.error as string) || (body?.message as string) || `HTTP ${status} error`

  // Auth errors should throw McpError to abort the request
  if (status === 401 || status === 403) {
    throw new McpError(ErrorCode.InvalidRequest, message)
  }

  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  }
}
