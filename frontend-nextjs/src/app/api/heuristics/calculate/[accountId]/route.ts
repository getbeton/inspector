import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/heuristics/calculate/[accountId]
 * Calculate and persist scores for an account
 */
export async function POST(
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
      .select('id, fit_score')
      .eq('id', accountId)
      .eq('workspace_id', memberData.workspace_id)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Calculate all scores
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

    const healthScore = healthResult.data?.[0]?.score || 0
    const expansionScore = expansionResult.data?.[0]?.score || 0
    const churnRiskScore = churnResult.data?.[0]?.score || 0

    const now = new Date().toISOString()
    const validUntil = new Date()
    validUntil.setHours(validUntil.getHours() + 24) // Scores valid for 24 hours

    // Persist scores to database
    const scoresToUpsert = [
      {
        workspace_id: memberData.workspace_id,
        account_id: accountId,
        score_type: 'health',
        score_value: healthScore,
        component_scores: healthResult.data?.[0]?.component_scores || {},
        calculated_at: now,
        valid_until: validUntil.toISOString()
      },
      {
        workspace_id: memberData.workspace_id,
        account_id: accountId,
        score_type: 'expansion',
        score_value: expansionScore,
        component_scores: { signals: expansionResult.data?.[0]?.expansion_signals || [] },
        calculated_at: now,
        valid_until: validUntil.toISOString()
      },
      {
        workspace_id: memberData.workspace_id,
        account_id: accountId,
        score_type: 'churn_risk',
        score_value: churnRiskScore,
        component_scores: { signals: churnResult.data?.[0]?.risk_signals || [] },
        calculated_at: now,
        valid_until: validUntil.toISOString()
      }
    ]

    // Insert new scores
    const { error: insertError } = await supabase
      .from('heuristic_scores')
      .insert(scoresToUpsert)

    if (insertError) {
      console.error('Error inserting scores:', insertError)
    }

    // Update account's health_score field
    await supabase
      .from('accounts')
      .update({ health_score: healthScore })
      .eq('id', accountId)

    // Get concrete grade
    const { data: gradeResult } = await supabase.rpc('get_concrete_grade', {
      p_score: healthScore
    })

    return NextResponse.json({
      account_id: accountId,
      scores: {
        health: healthScore,
        expansion: expansionScore,
        churn_risk: churnRiskScore
      },
      concrete_grade: gradeResult?.[0] || { grade: 'M50', label: 'Standard', color: '#f59e0b' },
      calculated_at: now,
      valid_until: validUntil.toISOString()
    })
  } catch (error) {
    console.error('Error in POST /api/heuristics/calculate/[accountId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
