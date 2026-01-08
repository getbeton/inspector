import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type {
  Account,
  HeuristicScore,
  HealthScoreResult,
  ExpansionScoreResult,
  ChurnRiskResult,
  ConcreteGradeResult
} from '@/lib/supabase/types'

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
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Verify account belongs to workspace
    const { data: accountData } = await supabase
      .from('accounts')
      .select('id, name, domain, health_score, fit_score')
      .eq('id', accountId)
      .eq('workspace_id', membership.workspaceId)
      .single()

    const account = accountData as Pick<Account, 'id' | 'name' | 'domain' | 'health_score' | 'fit_score'> | null

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Get latest scores from heuristic_scores table
    const { data: storedScoresData } = await supabase
      .from('heuristic_scores')
      .select('score_type, score_value, component_scores, calculated_at')
      .eq('account_id', accountId)
      .eq('workspace_id', membership.workspaceId)
      .order('calculated_at', { ascending: false })
      .limit(3)

    const storedScores = storedScoresData as Pick<HeuristicScore, 'score_type' | 'score_value' | 'component_scores' | 'calculated_at'>[] | null

    // Calculate fresh scores using database functions
    const [healthResult, expansionResult, churnResult] = await Promise.all([
      supabase.rpc('calculate_health_score', {
        p_account_id: accountId,
        p_workspace_id: membership.workspaceId
      } as never),
      supabase.rpc('calculate_expansion_score', {
        p_account_id: accountId,
        p_workspace_id: membership.workspaceId
      } as never),
      supabase.rpc('calculate_churn_risk_score', {
        p_account_id: accountId,
        p_workspace_id: membership.workspaceId
      } as never)
    ])

    const healthData = healthResult.data as HealthScoreResult[] | null
    const expansionData = expansionResult.data as ExpansionScoreResult[] | null
    const churnData = churnResult.data as ChurnRiskResult[] | null

    // Get concrete grade for health score
    const healthScore = healthData?.[0]?.score || account.health_score || 0
    const { data: gradeData } = await supabase.rpc('get_concrete_grade', {
      p_score: healthScore
    } as never)

    const gradeResult = gradeData as ConcreteGradeResult[] | null

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
          component_scores: healthData?.[0]?.component_scores || {},
          signal_count: (healthData?.[0] as HealthScoreResult & { signal_count?: number })?.signal_count || 0
        },
        expansion: {
          score: expansionData?.[0]?.score || 0,
          signals: expansionData?.[0]?.expansion_signals || []
        },
        churn_risk: {
          score: churnData?.[0]?.score || 0,
          signals: churnData?.[0]?.risk_signals || []
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
