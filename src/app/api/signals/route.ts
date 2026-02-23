import { createClient, createClientFromRequest } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SignalInsert } from '@/lib/supabase/types'

/**
 * GET /api/signals
 *
 * List signals for current workspace. Returns a unified list that merges:
 * - Custom signal definitions (from signal_definitions table)
 * - Heuristic signal occurrences (from signals table)
 *
 * Both are enriched with metrics from signal_aggregates.
 */
export async function GET(request: NextRequest) {
  try {
    const hasBearerToken = request.headers.get('authorization')?.startsWith('Bearer ')
    const supabase = hasBearerToken
      ? await createClientFromRequest(request)
      : await createClient()

    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const type = searchParams.get('type')
    const source = searchParams.get('source')
    const accountId = searchParams.get('account_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's workspace
    let workspaceId: string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySupabase = supabase as any

    if (hasBearerToken) {
      const { data } = await anySupabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single()
      if (!data) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
      workspaceId = data.workspace_id
    } else {
      const membership = await getWorkspaceMembership()
      if (!membership) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
      workspaceId = membership.workspaceId
    }

    // If requesting only custom/manual signals, query signal_definitions
    // If requesting heuristic, query signals. Otherwise merge both.
    const wantCustom = !source || source === 'manual'
    const wantHeuristic = !source || source !== 'manual'

    // Run all queries in parallel
    const [definitionsResult, signalsResult, aggregatesResult] = await Promise.all([
      // Custom signal definitions
      wantCustom ? (async () => {
        let q = anySupabase
          .from('signal_definitions')
          .select('*', { count: 'exact' })
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })

        if (type) q = q.eq('type', type)
        if (startDate) q = q.gte('created_at', startDate)
        if (endDate) q = q.lte('created_at', endDate)

        // Only paginate definitions if we're not also querying occurrences
        if (!wantHeuristic) {
          const from = (page - 1) * limit
          q = q.range(from, from + limit - 1)
        }

        return q
      })() : Promise.resolve({ data: [], count: 0, error: null }),

      // Heuristic signal occurrences
      wantHeuristic ? (async () => {
        let q = anySupabase
          .from('signals')
          .select(`
            *,
            accounts (
              id,
              name,
              domain,
              arr,
              health_score
            )
          `, { count: 'exact' })
          .eq('workspace_id', workspaceId)
          .order('timestamp', { ascending: false })

        if (type) q = q.eq('type', type)
        if (accountId) q = q.eq('account_id', accountId)
        if (startDate) q = q.gte('timestamp', startDate)
        if (endDate) q = q.lte('timestamp', endDate)

        if (!wantCustom) {
          const from = (page - 1) * limit
          q = q.range(from, from + limit - 1)
        }

        return q
      })() : Promise.resolve({ data: [], count: 0, error: null }),

      // Aggregated metrics
      anySupabase
        .from('signal_aggregates')
        .select('*')
        .eq('workspace_id', workspaceId) as unknown as Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>,
    ])

    if (signalsResult.error) {
      console.error('Error fetching signals:', signalsResult.error)
      return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 })
    }

    // Build aggregates lookup
    const aggregatesMap: Record<string, Record<string, unknown>> = {}
    if (aggregatesResult.data) {
      for (const agg of aggregatesResult.data) {
        aggregatesMap[agg.signal_type as string] = agg
      }
    }

    // Normalize definitions to look like signals in the response
    const definitionItems = (definitionsResult?.data || []).map((def: Record<string, unknown>) => {
      const agg = aggregatesMap[def.type as string]
      return {
        id: def.id,
        workspace_id: def.workspace_id,
        type: def.type,
        source: 'manual',
        timestamp: def.created_at,
        created_at: def.created_at,
        value: null,
        account_id: null,
        accounts: null,
        is_definition: true,
        details: {
          name: def.name,
          description: def.description,
          event_name: def.event_name,
          condition_operator: def.condition_operator,
          condition_value: def.condition_value,
          time_window_days: def.time_window_days,
          conversion_event: def.conversion_event,
          lift: agg?.avg_lift ?? null,
          confidence: agg?.confidence_score ?? null,
          conversion_with: agg?.avg_conversion_rate ?? null,
          leads_per_month: agg?.count_last_30d ? Math.round((agg.count_last_30d as number) / 4.3) : null,
          match_count_7d: agg?.count_last_7d ?? null,
          match_count_30d: agg?.count_last_30d ?? null,
          match_count_total: agg?.total_count ?? null,
          sample_with: agg?.sample_size ?? null,
        },
      }
    })

    // Enrich heuristic signals with aggregate metrics
    const occurrenceItems = (signalsResult.data || []).map((signal: { type: string; details: Record<string, unknown> | null }) => {
      const agg = aggregatesMap[signal.type]
      if (!agg) return signal
      return {
        ...signal,
        details: {
          ...(signal.details || {}),
          lift: agg.avg_lift ?? null,
          confidence: agg.confidence_score ?? null,
          conversion_with: agg.avg_conversion_rate ?? null,
          leads_per_month: agg.count_last_30d ? Math.round((agg.count_last_30d as number) / 4.3) : null,
          match_count_7d: agg.count_last_7d ?? null,
          match_count_30d: agg.count_last_30d ?? null,
          match_count_total: agg.total_count ?? null,
          sample_with: agg.sample_size ?? null,
        },
      }
    })

    // Merge and paginate
    const allItems = [...definitionItems, ...occurrenceItems]
    const totalCount = (definitionsResult?.count || 0) + (signalsResult.count || 0)

    // Apply pagination to merged result if both sources were queried
    let paginatedItems = allItems
    if (wantCustom && wantHeuristic) {
      const from = (page - 1) * limit
      paginatedItems = allItems.slice(from, from + limit)
    }

    return NextResponse.json({
      signals: paginatedItems,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: totalCount ? Math.ceil(totalCount / limit) : 0
      }
    })
  } catch (error) {
    console.error('Error in GET /api/signals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/signals
 * Create a new signal occurrence (from integrations/heuristics)
 */
export async function POST(request: NextRequest) {
  try {
    const hasBearerToken = request.headers.get('authorization')?.startsWith('Bearer ')
    const supabase = hasBearerToken
      ? await createClientFromRequest(request)
      : await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySupabase = supabase as any

    // Get user's workspace
    let workspaceId: string

    if (hasBearerToken) {
      const { data } = await anySupabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single()
      if (!data) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
      workspaceId = data.workspace_id
    } else {
      const membership = await getWorkspaceMembership()
      if (!membership) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
      workspaceId = membership.workspaceId
    }

    const body = await request.json()
    const { account_id, type, value, details, source } = body

    if (!account_id || !type) {
      return NextResponse.json(
        { error: 'account_id and type are required' },
        { status: 400 }
      )
    }

    // Verify account belongs to workspace
    const { data: account } = await anySupabase
      .from('accounts')
      .select('id')
      .eq('id', account_id)
      .eq('workspace_id', workspaceId)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Create signal occurrence
    const signalData: SignalInsert = {
      workspace_id: workspaceId,
      account_id,
      type,
      value: value || null,
      details: details || {},
      source: source || 'manual'
    }

    const { data: signal, error } = await anySupabase
      .from('signals')
      .insert(signalData as never)
      .select()
      .single()

    if (error) {
      console.error('Error creating signal:', error)
      return NextResponse.json({ error: 'Failed to create signal' }, { status: 500 })
    }

    return NextResponse.json({ signal }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/signals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
