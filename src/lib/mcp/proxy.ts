/**
 * HTTP proxy helper — MCP tools → Next.js API routes
 *
 * Identical pattern to packages/mcp-server/src/lib/proxy.ts but runs
 * inside the Next.js process. On Vercel this makes self-referential
 * HTTP calls which is supported and common.
 */

function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function callApi(
  path: string,
  authHeader: string | undefined,
  options?: {
    method?: string
    body?: unknown
    params?: Record<string, string>
  }
): Promise<{ data: unknown; status: number }> {
  const url = new URL(path, getAppUrl())

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
