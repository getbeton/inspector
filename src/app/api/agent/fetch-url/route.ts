import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials'
import { createFirecrawlClient, FirecrawlAuthError, FirecrawlRateLimitError, FirecrawlPaymentError, FirecrawlError } from '@/lib/integrations/firecrawl'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FetchUrlRequest, FetchUrlResult } from '@/lib/agent/types'
import type { Json } from '@/lib/supabase/types'

const log = createModuleLogger('[API][Agent][FetchURL]')

// ============================================
// SSRF prevention
// ============================================

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
]

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',           // AWS/GCP metadata
  'metadata.google.internal',  // GCP metadata
])

/**
 * Validate a URL for SSRF safety. Returns error message or null if valid.
 */
function validateUrl(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return 'Invalid URL format'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only HTTP and HTTPS protocols are allowed'
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets

  if (BLOCKED_HOSTS.has(hostname)) {
    return 'Access to this host is blocked (metadata endpoint)'
  }

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return 'Access to private/internal addresses is blocked'
    }
  }

  return null
}

// ============================================
// Cache helpers
// ============================================

async function getCachedResult(
  sessionId: string,
  url: string,
  operation: string
): Promise<FetchUrlResult | null> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types yet
  const { data, error } = await (supabase.from as any)('agent_fetch_cache')
    .select('content')
    .eq('session_id', sessionId)
    .eq('url', url)
    .eq('operation', operation)
    .single()

  if (error || !data) return null

  const content = (data as { content: Record<string, unknown> }).content
  return {
    url,
    success: true,
    cached: true,
    data: content as FetchUrlResult['data'],
  }
}

async function cacheResult(
  sessionId: string,
  url: string,
  operation: string,
  data: FetchUrlResult['data']
): Promise<void> {
  const supabase = createAdminClient()
  const contentStr = JSON.stringify(data)
  const contentSizeBytes = new TextEncoder().encode(contentStr).length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types yet
  await (supabase.from as any)('agent_fetch_cache')
    .upsert(
      {
        session_id: sessionId,
        url,
        operation,
        content: data as unknown as Json,
        content_size_bytes: contentSizeBytes,
      },
      { onConflict: 'session_id,url,operation' }
    )
}

// ============================================
// Single URL fetch
// ============================================

async function fetchSingleUrl(
  client: ReturnType<typeof createFirecrawlClient>,
  url: string,
  body: FetchUrlRequest,
  sessionId: string
): Promise<FetchUrlResult> {
  const operation = body.operation || 'scrape'

  // Check cache first
  if (!body.skip_cache) {
    const cached = await getCachedResult(sessionId, url, operation)
    if (cached) return cached
  }

  try {
    let data: FetchUrlResult['data']

    switch (operation) {
      case 'scrape': {
        const result = await client.scrape(url, {
          formats: body.formats,
          onlyMainContent: body.only_main_content,
          timeout: body.timeout,
          includeTags: body.selectors?.include,
          excludeTags: body.selectors?.exclude,
        })
        data = result.data
        break
      }

      case 'crawl': {
        const result = await client.crawl(url, {
          maxPages: body.max_pages,
          maxDepth: body.max_depth,
          formats: body.formats,
          onlyMainContent: body.only_main_content,
        })
        // For crawl, combine all page results into a single data object
        data = {
          markdown: result.data.map(d => d.markdown).filter(Boolean).join('\n\n---\n\n'),
          links: result.data.flatMap(d => d.links || []),
          metadata: {
            title: `Crawl: ${result.completed}/${result.total} pages`,
            sourceURL: url,
          },
          truncated: result.data.some(d => d.truncated),
        }
        break
      }

      case 'extract': {
        const result = await client.extract([url], {
          schema: body.schema,
          prompt: body.prompt,
          timeout: body.timeout,
        })
        data = {
          markdown: JSON.stringify(result.data, null, 2),
          metadata: { sourceURL: url },
        }
        break
      }

      default:
        return { url, success: false, cached: false, error: `Unknown operation: ${operation}` }
    }

    // Cache the result
    await cacheResult(sessionId, url, operation, data).catch(err => {
      log.warn(`Failed to cache result for ${url}: ${err}`)
    })

    return { url, success: true, cached: false, data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { url, success: false, cached: false, error: message }
  }
}

// ============================================
// Route handler
// ============================================

export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as FetchUrlRequest
    const { session_id, url, urls } = body

    // Validate required fields
    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    if (!url && (!urls || urls.length === 0)) {
      return NextResponse.json({ error: 'Missing url or urls' }, { status: 400 })
    }

    // Collect all URLs to process
    const allUrls = urls || (url ? [url] : [])
    const isBatch = !!urls

    // SSRF validation on all URLs
    for (const u of allUrls) {
      const ssrfError = validateUrl(u)
      if (ssrfError) {
        return NextResponse.json(
          { error: `Blocked URL "${u}": ${ssrfError}` },
          { status: 400 }
        )
      }
    }

    // Resolve session → workspace
    let workspaceId: string
    try {
      const session = await resolveSession(session_id)
      workspaceId = session.workspaceId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    // Rate limit per workspace (15 req/min for fetch — scraping is expensive)
    const limited = rateLimitResponse(workspaceId, { maxRequests: 15 })
    if (limited) return limited

    // Get Firecrawl credentials
    const credentials = await getIntegrationCredentialsAdmin(workspaceId, 'firecrawl')
    if (!credentials || !credentials.apiKey) {
      return NextResponse.json(
        { error: 'Firecrawl integration not configured for this workspace' },
        { status: 404 }
      )
    }

    // Read config_json for mode/baseUrl/proxy
    const supabase = createAdminClient()
    const { data: configRow } = await supabase
      .from('integration_configs')
      .select('config_json')
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'firecrawl')
      .single()

    const configJson = (configRow?.config_json || {}) as Record<string, unknown>

    const client = createFirecrawlClient({
      apiKey: credentials.apiKey,
      mode: (configJson.mode as 'cloud' | 'self_hosted') || 'cloud',
      baseUrl: configJson.base_url as string | undefined,
      proxy: (configJson.proxy as 'basic' | 'stealth') || null,
    })

    // Audit log
    log.warn(
      `[AUDIT] fetch-url workspace=${workspaceId} op=${body.operation || 'scrape'} urls=${allUrls.join(',')}`
    )

    // Process URLs
    if (!isBatch) {
      // Single URL mode
      const result = await fetchSingleUrl(client, allUrls[0], body, session_id)

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 502 }
        )
      }

      return NextResponse.json({
        success: true,
        cached: result.cached,
        data: result.data,
      })
    }

    // Batch mode — process all URLs
    const results = await Promise.all(
      allUrls.map(u => fetchSingleUrl(client, u, body, session_id))
    )

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    // Map Firecrawl-specific errors to appropriate HTTP status codes
    if (error instanceof FirecrawlAuthError) {
      return NextResponse.json({ error: 'Upstream authentication failure' }, { status: 502 })
    }
    if (error instanceof FirecrawlRateLimitError) {
      return NextResponse.json(
        { error: 'Upstream rate limit exceeded' },
        {
          status: 429,
          headers: { 'Retry-After': String(error.retryAfter) },
        }
      )
    }
    if (error instanceof FirecrawlPaymentError) {
      return NextResponse.json({ error: 'Firecrawl credits exhausted' }, { status: 402 })
    }
    if (error instanceof FirecrawlError) {
      return NextResponse.json(
        { error: `Upstream error: ${error.message}` },
        { status: 502 }
      )
    }

    log.error(`Fetch URL failed: ${error}`)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
