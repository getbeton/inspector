/**
 * GET /api/accounts
 *
 * List accounts for the current workspace with pagination, filtering, and sorting.
 * Supports both cookie-based browser auth and Bearer JWT auth (MCP proxy).
 *
 * Security fixes:
 * - H6: sort_by column injection prevented by allowlist
 * - L3: NaN guard on numeric query params
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'

// H6 fix: Allowlist of valid sort columns prevents column name injection
const ALLOWED_SORT_COLUMNS = new Set([
  'health_score',
  'name',
  'domain',
  'arr',
  'created_at',
  'last_activity_at',
])

async function handleListAccounts(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { supabase, workspaceId } = context
  const searchParams = request.nextUrl.searchParams

  // L3 fix: NaN guard on numeric params
  const page = parseInt(searchParams.get('page') || '1') || 1
  const limit = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 100)
  const status = searchParams.get('status')
  const sortOrder = searchParams.get('sort_order') || 'desc'

  // H6 fix: Validate sort_by against allowlist
  const rawSortBy = searchParams.get('sort_by') || 'health_score'
  const sortBy = ALLOWED_SORT_COLUMNS.has(rawSortBy) ? rawSortBy : 'health_score'

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
