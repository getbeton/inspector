/**
 * HTTP proxy helper for MCP → Next.js API delegation
 *
 * All business logic lives in the Next.js app. The MCP server is a thin proxy
 * that forwards requests with the user's auth header and returns the results.
 *
 * Security fixes:
 * - M16: Fetch timeout (30s) via AbortController
 * - M18: SSRF protection via path prefix allowlist and URL validation
 */

import { logToolInvocation, sanitizeParams } from './logger.js'

const APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3000'

// M18 fix: Validate NEXT_APP_URL at module load
try {
  const parsed = new URL(APP_URL)
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    console.warn('[Proxy] WARNING: NEXT_APP_URL is not HTTPS in production')
  }
} catch {
  throw new Error(`Invalid NEXT_APP_URL: ${APP_URL}`)
}

// M18 fix: Allowlist of valid API path prefixes
const ALLOWED_PATH_PREFIXES = [
  '/api/accounts',
  '/api/signals',
  '/api/billing',
  '/api/integrations',
  '/api/mcp',
  '/api/agent',
  '/api/heuristics',
  '/api/workspace',
  '/api/sync',
  '/api/posthog',
  '/api/user',
]

// M16 fix: Default fetch timeout
const FETCH_TIMEOUT_MS = 30_000

export async function callApi(
  path: string,
  authHeader: string | undefined,
  options?: {
    method?: string
    body?: unknown
    params?: Record<string, string>
    /** Tool name for request logging. If set, the invocation is logged. */
    toolName?: string
  }
): Promise<{ data: unknown; status: number }> {
  // M18 fix: Validate path against allowlist
  const isAllowed = ALLOWED_PATH_PREFIXES.some(prefix => path.startsWith(prefix))
  if (!isAllowed) {
    throw new Error(`Path not allowed: ${path}`)
  }

  const start = Date.now()
  const url = new URL(path, APP_URL)

  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined && v !== '') {
        url.searchParams.set(k, v)
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (authHeader) {
    headers['Authorization'] = authHeader
  }

  // M16 fix: AbortController with 30s timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let data: unknown
  let status: number
  try {
    const res = await fetch(url.toString(), {
      method: options?.method || 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })

    data = await res.json()
    status = res.status
  } catch (error) {
    // Log the failure, then re-throw so the tool handler can handle it
    if (options?.toolName) {
      logToolInvocation(
        {
          tool_name: options.toolName,
          status: 'error',
          duration_ms: Date.now() - start,
          error_message: error instanceof Error ? error.message : 'Network error',
          request_params: options.params ? sanitizeParams(options.params) : undefined,
        },
        authHeader,
      )
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  // Fire-and-forget log for successful calls
  if (options?.toolName) {
    logToolInvocation(
      {
        tool_name: options.toolName,
        status: status >= 200 && status < 400 ? 'success' : 'error',
        status_code: status,
        duration_ms: Date.now() - start,
        request_params: options.params ? sanitizeParams(options.params) : undefined,
        error_message: status >= 400 ? String((data as Record<string, unknown>)?.error ?? '') : undefined,
      },
      authHeader,
    )
  }

  return { data, status }
}
