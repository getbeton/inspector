/**
 * GET /api/accounts
 *
 * List accounts for the current workspace with pagination, filtering, and sorting.
 * Supports both cookie-based browser auth and Bearer JWT auth (MCP proxy).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'

async function handleListAccounts(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context
  const searchParams = request.nextUrl.searchParams

  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const status = searchParams.get('status')
  const sortBy = searchParams.get('sort_by') || 'health_score'
  const sortOrder = searchParams.get('sort_order') || 'desc'

  let query = supabase
    .from('accounts')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order(sortBy, { ascending: sortOrder === 'asc' })

  if (status) {
    query = query.eq('status', status)
  }

  const from = (page - 1) * limit
  query = query.range(from, from + limit - 1)

  const { data: accounts, count, error } = await query

  if (error) {
    console.error('Error fetching accounts:', error)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }

  return NextResponse.json({
    accounts: accounts || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: count ? Math.ceil(count / limit) : 0,
    },
  })
}

export const GET = withErrorHandler(withRLSContext(handleListAccounts))
