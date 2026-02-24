import { NextRequest, NextResponse } from 'next/server'
import { withRLSContext } from '@/lib/middleware/rls-context'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[API][QueryHistory][Detail]')

/**
 * GET /api/agent/data/queries/[id]
 *
 * User-authenticated detail endpoint returning a single query record
 * with full query_text and the associated result (columns, rows, metadata).
 */
export const GET = withRLSContext(async (request: NextRequest, { supabase, workspaceId }) => {
  // Extract [id] from the URL path
  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  const id = segments[segments.length - 1]

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    // Fetch the query record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table columns not in generated types yet
    const { data: queryData, error: queryError } = await (supabase as any)
      .from('posthog_queries')
      .select(
        'id, workspace_id, session_id, query_text, query_hash, status, execution_time_ms, error_message, created_at, started_at, completed_at'
      )
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single()

    if (queryError) {
      if (queryError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      log.error(`Failed to fetch query detail: ${queryError.message}`)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Fetch the associated result (may not exist for pending/failed queries)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: resultData } = await (supabase as any)
      .from('posthog_query_results')
      .select('columns, results, row_count, created_at, expires_at')
      .eq('query_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      query: queryData,
      result: resultData
        ? {
            columns: resultData.columns,
            results: resultData.results,
            row_count: resultData.row_count,
            cached_at: resultData.created_at,
            expires_at: resultData.expires_at,
          }
        : null,
    })
  } catch (e) {
    log.error(`Query detail failed: ${e}`)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
