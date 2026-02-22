import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials'
import { createFirecrawlClient } from '@/lib/integrations/firecrawl'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FetchUrlRequest, FetchUrlResult } from '@/lib/agent/types'
import { validateUrl } from '@/lib/utils/ssrf'
import type { Json } from '@/lib/supabase/types'

const log = createModuleLogger('[API][Agent][FetchURL]')

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

    // Batch URL count cap — prevent a single request from firing too many upstream calls.
    // Capped at 5 to stay within Vercel's 60s function timeout (each scrape can take 5–30s).
    if (urls && urls.length > 5) {
      return NextResponse.json(
        { error: 'Maximum 5 URLs per batch request' },
        { status: 400 }
      )
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

    // Rate limit per workspace (15 req/min for fetch — scraping is expensive).
    // Note: this is an in-memory counter, so the effective limit is 15 × N instances
    // on Vercel serverless. Acceptable tradeoff — Firecrawl's own rate limits are the
    // real backstop.
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

    // Audit log — redact query strings to avoid leaking tokens/PII
    const redactedUrls = allUrls.map(u => {
      try { const p = new URL(u); return `${p.origin}${p.pathname}` } catch { return '[invalid]' }
    })
    log.info(
      `[AUDIT] fetch-url workspace=${workspaceId} op=${body.operation || 'scrape'} count=${allUrls.length} urls=${redactedUrls.join(',')}`
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

    // Batch mode — process sequentially with a wall-clock budget.
    // Abort remaining URLs if we approach Vercel's 60s function timeout.
    const BATCH_BUDGET_MS = 50_000
    const batchStart = Date.now()
    const results: FetchUrlResult[] = []

    for (const u of allUrls) {
      if (Date.now() - batchStart > BATCH_BUDGET_MS) {
        // Budget exhausted — mark remaining URLs as timed out
        results.push({ url: u, success: false, cached: false, error: 'Batch wall-clock budget exceeded' })
        continue
      }
      results.push(await fetchSingleUrl(client, u, body, session_id))
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    // Only setup errors (resolveSession, getIntegrationCredentialsAdmin,
    // createFirecrawlClient) reach here — fetchSingleUrl handles its own errors.
    log.error(`Fetch URL failed: ${error}`)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
