/**
 * Health Score Decrease Detector
 * Detects >20% health score decrease
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, createDetectedSignal, calculatePercentageChange, daysAgo } from '../helpers'

export const healthScoreDecreaseDetector: SignalDetectorDefinition = {
  meta: {
    name: 'health_score_decrease',
    category: 'churn_risk',
    description: 'Declining health score',
    defaultConfig: {
      threshold: -0.20,
      time_window_days: 30,
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const threshold = config?.threshold ?? -0.20
    const timeWindowDays = config?.time_window_days ?? 30
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'health_score_decrease', lookbackDays)) {
      return null
    }

    const cutoff = daysAgo(timeWindowDays)

    // Get current score
    const { data: currentScoreData } = await supabase
      .from('heuristic_scores')
      .select('score_value, calculated_at')
      .eq('account_id', accountId)
      .eq('score_type', 'health')
      .order('calculated_at', { ascending: false })
      .limit(1)

    const currentScore = currentScoreData?.[0]

    // Get previous score (before cutoff)
    const { data: previousScoreData } = await supabase
      .from('heuristic_scores')
      .select('score_value, calculated_at')
      .eq('account_id', accountId)
      .eq('score_type', 'health')
      .lt('calculated_at', cutoff.toISOString())
      .order('calculated_at', { ascending: false })
      .limit(1)

    const previousScore = previousScoreData?.[0]

    if (!currentScore || !previousScore) {
      return null
    }

    const pctChange = calculatePercentageChange(previousScore.score_value, currentScore.score_value)

    if (pctChange <= threshold) {
      return createDetectedSignal(accountId, workspaceId, 'health_score_decrease', pctChange, {
        current_score: currentScore.score_value,
        previous_score: previousScore.score_value,
        decline_pct: Math.round(Math.abs(pctChange) * 1000) / 10,
      })
    }

    return null
  },
}
