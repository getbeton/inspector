/**
 * Error handling utilities for MCP tools
 *
 * Maps application errors and HTTP statuses to MCP-compatible responses.
 *
 * Security fix:
 * - L6: Sanitize infrastructure details (ECONNREFUSED, ENOTFOUND, etc.)
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'

/**
 * Convert any error into an MCP tool error response.
 * L6 fix: Sanitize infrastructure leak patterns.
 */
export function toMcpError(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message = sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error')

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

/**
 * L6 fix: Detect and sanitize infrastructure error messages
 * that could leak internal network topology.
 */
function sanitizeErrorMessage(message: string): string {
  // Network errors that reveal infrastructure details
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH/i.test(message)) {
    return 'Upstream service unavailable'
  }

  // AbortError from timeout
  if (/AbortError|aborted/i.test(message)) {
    return 'Request timed out'
  }

  // DNS resolution errors
  if (/getaddrinfo|EAI_AGAIN/i.test(message)) {
    return 'Upstream service unavailable'
  }

  // Socket/TLS errors
  if (/ECONNRESET|EPIPE|ERR_TLS/i.test(message)) {
    return 'Upstream connection error'
  }

  return message
}
