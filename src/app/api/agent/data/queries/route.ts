import { NextResponse } from 'next/server'
import { withRLSContext } from '@/lib/middleware/rls-context'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[API][QueryHistory]')

/** Valid query statuses for filtering */
const VALID_STATUSES = ['pending', 'running', 'completed', 'failed', 'timeout']

/** Max characters for query_text in list view */
const QUERY_TEXT_TRUNCATE = 200

/**
 * GET /api/agent/data/queries
 *
 * User-authenticated endpoint returning paginated query execution history.
 * Uses cursor-based pagination (created_at DESC). Truncates query_text
 * and excludes result data to keep list payloads small.
 */
export const GET = withRLSContext(async (request, { supabase, workspaceId }) => {
  const { searchParams } = new URL(request.url)

  // Parse pagination & filter params
  const cursor = searchParams.get('cursor') // ISO timestamp for cursor-based pagination
  const limitParam = searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50)
  const sessionId = searchParams.get('sessionId')
  const status = searchParams.get('status')

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table columns not in generated types yet
    let query = (supabase as any)
      .from('posthog_queries')
      .select(
        'id, workspace_id, session_id, query_text, query_hash, status, execution_time_ms, error_message, created_at, started_at, completed_at',
        { count: 'exact' }
      )
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) {
      log.error(`Failed to list query history: ${error.message}`)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Truncate query_text for list view
    const queries = (data || []).map((row: Record<string, unknown>) => ({
      ...row,
      query_text:
        typeof row.query_text === 'string' && row.query_text.length > QUERY_TEXT_TRUNCATE
          ? row.query_text.substring(0, QUERY_TEXT_TRUNCATE) + '...'
          : row.query_text,
    }))

    const lastRow = queries[queries.length - 1]
    const nextCursor = queries.length === limit && lastRow ? lastRow.created_at : null

    return NextResponse.json({
      queries,
      next_cursor: nextCursor,
      total_count: count ?? 0,
    })
  } catch (e) {
    log.error(`Query history list failed: ${e}`)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
