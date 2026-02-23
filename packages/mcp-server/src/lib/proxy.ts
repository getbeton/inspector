/**
 * HTTP proxy helper for MCP → Next.js API delegation
 *
 * All business logic lives in the Next.js app. The MCP server is a thin proxy
 * that forwards requests with the user's auth header and returns the results.
 */

const APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3000'

export async function callApi(
  path: string,
  authHeader: string | undefined,
  options?: {
    method?: string
    body?: unknown
    params?: Record<string, string>
  }
): Promise<{ data: unknown; status: number }> {
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

  const res = await fetch(url.toString(), {
    method: options?.method || 'GET',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await res.json()
  return { data, status: res.status }
}
