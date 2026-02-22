import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { resolveSession } from '@/lib/agent/session'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

const log = createModuleLogger('[API][Agent][FetchURL][Results]')

/**
 * GET /api/agent/fetch-url/results
 *
 * Agent-authenticated endpoint for cross-session URL lookup.
 * Lets agents check if a URL has been scraped in a prior session within the
 * same workspace, avoiding redundant Firecrawl API calls.
 *
 * Supports single-URL and batch-URL modes.
 */
export async function GET(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  const singleUrl = searchParams.get('url')
  const batchUrls = searchParams.get('urls')
  const operation = searchParams.get('operation') || 'scrape'

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
  }

  if (!singleUrl && !batchUrls) {
    return NextResponse.json({ error: 'Missing url or urls parameter' }, { status: 400 })
  }

  // Resolve current session → workspace (validates the agent's session is active)
  let workspaceId: string
  try {
    const session = await resolveSession(sessionId)
    workspaceId = session.workspaceId
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid session'
    return NextResponse.json({ error: msg }, { status: 404 })
  }

  // Rate limit per workspace
  const limited = rateLimitResponse(workspaceId)
  if (limited) return limited

  const supabase = createAdminClient()

  try {
    if (singleUrl) {
      // Single URL mode — return latest result for this URL across all sessions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types yet
      const { data, error } = await (supabase as any)
        .from('agent_fetch_cache')
        .select('url, operation, session_id, created_at, content')
        .eq('workspace_id', workspaceId)
        .eq('url', singleUrl)
        .eq('operation', operation)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code === 'PGRST116') {
        return NextResponse.json({ found: false })
      }

      if (error) {
        log.error(`Cross-session lookup failed: ${error.message}`)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        found: true,
        result: {
          url: data.url,
          operation: data.operation,
          session_id: data.session_id,
          created_at: data.created_at,
          data: data.content,
        },
      })
    }

    // Batch URL mode — look up multiple URLs
    const urlList = batchUrls!.split(',').map(u => u.trim()).filter(Boolean)

    if (urlList.length === 0) {
      return NextResponse.json({ error: 'Empty urls parameter' }, { status: 400 })
    }

    if (urlList.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 URLs per batch lookup' }, { status: 400 })
    }

    // Query all matching rows, ordered by created_at DESC.
    // We'll pick the latest per URL in application code since Supabase JS
    // doesn't support DISTINCT ON directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types yet
    const { data, error } = await (supabase as any)
      .from('agent_fetch_cache')
      .select('url, operation, session_id, created_at, content')
      .eq('workspace_id', workspaceId)
      .in('url', urlList)
      .eq('operation', operation)
      .order('created_at', { ascending: false })

    if (error) {
      log.error(`Batch cross-session lookup failed: ${error.message}`)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Build results map — first occurrence per URL is the latest (ordered DESC)
    const resultsMap: Record<string, { found: boolean; session_id?: string; created_at?: string; data?: unknown }> = {}

    for (const u of urlList) {
      resultsMap[u] = { found: false }
    }

    for (const row of (data || [])) {
      if (!resultsMap[row.url]?.found) {
        resultsMap[row.url] = {
          found: true,
          session_id: row.session_id,
          created_at: row.created_at,
          data: row.content,
        }
      }
    }

    return NextResponse.json({ results: resultsMap })
  } catch (e) {
    log.error(`Cross-session lookup failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
