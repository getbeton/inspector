/**
 * Fire-and-forget MCP request logger.
 *
 * Sends tool invocation logs to the Next.js API without blocking tool responses.
 * Logging failures are silently swallowed — they must never affect tool behavior.
 */

const APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3000'

export interface McpLogEntry {
  tool_name: string
  status: 'success' | 'error'
  status_code?: number
  duration_ms?: number
  request_params?: Record<string, unknown>
  error_message?: string
  session_id?: string
}

/**
 * Send a log entry to the Next.js API. Fire-and-forget — never awaited.
 */
export function logToolInvocation(
  entry: McpLogEntry,
  authHeader: string | undefined,
): void {
  const url = `${APP_URL}/api/mcp/logs`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (authHeader) {
    headers['Authorization'] = authHeader
  }

  // Fire-and-forget: don't await, swallow errors
  fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(entry),
  }).catch(() => {
    // Intentionally swallowed — logging must never block or fail tool responses
  })
}

/**
 * Sanitize request params for logging. Strips potentially sensitive values.
 */
export function sanitizeParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    // Strip anything that looks like a secret
    if (/token|secret|key|password|credential/i.test(key)) {
      sanitized[key] = '[REDACTED]'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}
