import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { FALLBACK_SAMPLE } from '@/lib/setup/sample-data'

/**
 * GET /api/integrations/attio/sample-data
 *
 * Returns one example data record for populating the deal mapping preview.
 * Tries to fetch real account data from the workspace, falls back to hardcoded sample.
 */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace()
    const supabase = await createClient()

    // Try to fetch a real account with signals
    // Note: `as any` cast needed because Supabase types may not include all tables yet
    const { data: account } = await (supabase as any)
      .from('accounts')
      .select('id, name, domain, health_score, signal_count, concrete_grade')
      .eq('workspace_id', workspaceId)
      .order('signal_count', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (account?.name) {
      // Fetch the latest signal scoped to this specific account
      const { data: signal } = await (supabase as any)
        .from('signals')
        .select('name, signal_type, detected_at')
        .eq('workspace_id', workspaceId)
        .eq('account_id', account.id)
        .order('detected_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return NextResponse.json({
        sample: {
          company_name: account.name || FALLBACK_SAMPLE.company_name,
          company_domain: account.domain || FALLBACK_SAMPLE.company_domain,
          signal_name: signal?.name || FALLBACK_SAMPLE.signal_name,
          signal_type: signal?.signal_type || FALLBACK_SAMPLE.signal_type,
          health_score: account.health_score ?? FALLBACK_SAMPLE.health_score,
          concrete_grade: account.concrete_grade || FALLBACK_SAMPLE.concrete_grade,
          signal_count: account.signal_count ?? FALLBACK_SAMPLE.signal_count,
          deal_value: FALLBACK_SAMPLE.deal_value,
          detected_at: signal?.detected_at?.split('T')[0] || FALLBACK_SAMPLE.detected_at,
        },
      })
    }

    // No real data — use fallback
    return NextResponse.json({ sample: FALLBACK_SAMPLE })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    // On any error, still return fallback sample (non-critical endpoint)
    console.error('[Attio Sample Data] Error:', err)
    return NextResponse.json({ sample: FALLBACK_SAMPLE })
  }
}
