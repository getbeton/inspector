import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/heuristics/scores/[accountId]
 * Get all scores for an account
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's workspace
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()

    if (!memberData) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Verify account belongs to workspace
    const { data: account } = await supabase
      .from('accounts')
      .select('id, name, domain, health_score, fit_score')
      .eq('id', accountId)
      .eq('workspace_id', memberData.workspace_id)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Get latest scores from heuristic_scores table
    const { data: storedScores } = await supabase
      .from('heuristic_scores')
      .select('score_type, score_value, component_scores, calculated_at')
      .eq('account_id', accountId)
      .eq('workspace_id', memberData.workspace_id)
      .order('calculated_at', { ascending: false })
      .limit(3)

    // Calculate fresh scores using database functions
    const [healthResult, expansionResult, churnResult] = await Promise.all([
      supabase.rpc('calculate_health_score', {
        p_account_id: accountId,
        p_workspace_id: memberData.workspace_id
      }),
      supabase.rpc('calculate_expansion_score', {
        p_account_id: accountId,
        p_workspace_id: memberData.workspace_id
      }),
      supabase.rpc('calculate_churn_risk_score', {
        p_account_id: accountId,
        p_workspace_id: memberData.workspace_id
      })
    ])

    // Get concrete grade for health score
    const healthScore = healthResult.data?.[0]?.score || account.health_score || 0
    const { data: gradeResult } = await supabase.rpc('get_concrete_grade', {
      p_score: healthScore
    })

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        domain: account.domain,
        fit_score: account.fit_score
      },
      scores: {
        health: {
          score: healthScore,
          component_scores: healthResult.data?.[0]?.component_scores || {},
          signal_count: healthResult.data?.[0]?.signal_count || 0
        },
        expansion: {
          score: expansionResult.data?.[0]?.score || 0,
          signals: expansionResult.data?.[0]?.expansion_signals || []
        },
        churn_risk: {
          score: churnResult.data?.[0]?.score || 0,
          signals: churnResult.data?.[0]?.risk_signals || []
        }
      },
      concrete_grade: gradeResult?.[0] || {
        grade: 'M50',
        label: 'Standard',
        color: '#f59e0b'
      },
      stored_scores: storedScores || []
    })
  } catch (error) {
    console.error('Error in GET /api/heuristics/scores/[accountId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
