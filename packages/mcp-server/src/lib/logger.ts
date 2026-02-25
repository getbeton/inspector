/**
 * Fire-and-forget MCP request logger.
 *
 * Sends tool invocation logs to the Next.js API without blocking tool responses.
 * Logging failures are silently swallowed — they must never affect tool behavior.
 *
 * Security fix:
 * - L7: Enhanced sanitizeParams — adds 'auth' to redacted keys + JWT detection on values
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

// L7 fix: Pattern to detect JWT values (base64url encoded segments starting with "ey")
const JWT_PATTERN = /^ey[A-Za-z0-9_-]+\./

/**
 * Sanitize request params for logging. Strips potentially sensitive values.
 *
 * L7 fix: Also redacts 'auth' keys and detects JWT tokens in values.
 */
export function sanitizeParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    // L7 fix: Added 'auth' to the key pattern
    if (/token|secret|key|password|credential|auth/i.test(key)) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'string' && JWT_PATTERN.test(value)) {
      // L7 fix: Detect JWT values regardless of key name
      sanitized[key] = '[REDACTED_JWT]'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}
