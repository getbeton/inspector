import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SignalInsert } from '@/lib/supabase/types'

/**
 * GET /api/signals
 * List all signals for current workspace with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
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
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Build query
    let query = supabase
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
      .eq('workspace_id', membership.workspaceId)
      .order('timestamp', { ascending: false })

    // Apply filters
    if (type) {
      query = query.eq('type', type)
    }
    if (source) {
      query = query.eq('source', source)
    }
    if (accountId) {
      query = query.eq('account_id', accountId)
    }
    if (startDate) {
      query = query.gte('timestamp', startDate)
    }
    if (endDate) {
      query = query.lte('timestamp', endDate)
    }

    // Apply pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    // Run both queries in parallel — aggregates don't depend on signal results
    const [signalsResult, aggregatesResult] = await Promise.all([
      query,
      supabase
        .from('signal_aggregates')
        .select('*')
        .eq('workspace_id', membership.workspaceId) as unknown as Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>,
    ])

    const { data: signals, error, count } = signalsResult

    if (error) {
      console.error('Error fetching signals:', error)
      return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 })
    }

    const aggregatesMap: Record<string, Record<string, unknown>> = {}
    if (aggregatesResult.data) {
      for (const agg of aggregatesResult.data) {
        aggregatesMap[agg.signal_type as string] = agg
      }
    }

    // Merge metrics into signal details for the response
    const enrichedSignals = (signals || []).map((signal: { type: string; details: Record<string, unknown> | null }) => {
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

    return NextResponse.json({
      signals: enrichedSignals,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: count ? Math.ceil(count / limit) : 0
      }
    })
  } catch (error) {
    console.error('Error in GET /api/signals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/signals
 * Create a new signal (usually from integrations)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's workspace
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
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
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', account_id)
      .eq('workspace_id', membership.workspaceId)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Create signal
    const signalData: SignalInsert = {
      workspace_id: membership.workspaceId,
      account_id,
      type,
      value: value || null,
      details: details || {},
      source: source || 'manual'
    }

    const { data: signal, error } = await supabase
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
