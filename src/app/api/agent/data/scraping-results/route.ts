import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[API][ScrapingResults]')

/**
 * GET /api/agent/data/scraping-results
 *
 * User-authenticated endpoint returning paginated scraping results for a workspace.
 * Uses cursor-based pagination (created_at DESC). Excludes `content` JSONB to
 * keep list payloads small — content is fetched on-demand via the /[id] detail route.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')

  if (!workspaceId) {
    return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse pagination & filter params
  const cursor = searchParams.get('cursor') // ISO timestamp of last row's created_at
  const limitParam = searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50)
  const sessionId = searchParams.get('sessionId')
  const operation = searchParams.get('operation')

  try {
    // Build query — select metadata columns only (exclude content JSONB)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types yet
    let query = (supabase as any)
      .from('agent_fetch_cache')
      .select('id, session_id, url, operation, content_size_bytes, created_at, updated_at', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    if (operation && ['scrape', 'crawl', 'extract'].includes(operation)) {
      query = query.eq('operation', operation)
    }

    const { data, error, count } = await query

    if (error) {
      log.error(`Failed to list scraping results: ${error.message}`)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const results = data || []
    const lastRow = results[results.length - 1]
    const nextCursor = results.length === limit && lastRow ? lastRow.created_at : null

    return NextResponse.json({
      results,
      next_cursor: nextCursor,
      total_count: count ?? 0,
    })
  } catch (e) {
    log.error(`Scraping results list failed: ${e}`)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
