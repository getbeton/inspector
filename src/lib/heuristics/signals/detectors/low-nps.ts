/**
 * Low NPS Detector
 * Detects low NPS scores (detractors with NPS <= 6)
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getLatestSignal, createDetectedSignal, daysAgo } from '../helpers'

export const lowNPSDetector: SignalDetectorDefinition = {
  meta: {
    name: 'low_nps',
    category: 'churn_risk',
    description: 'Low NPS score (detractor)',
    defaultConfig: {
      threshold: 6,
      time_window_days: 90,
      lookback_days: 30,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const threshold = config?.threshold ?? 6
    const timeWindowDays = config?.time_window_days ?? 90
    const lookbackDays = config?.lookback_days ?? 30

    if (await signalExists(supabase, accountId, 'low_nps', lookbackDays)) {
      return null
    }

    const recentCutoff = daysAgo(timeWindowDays)

    const npsSignal = await getLatestSignal(supabase, accountId, 'nps_response', {
      maxValue: threshold,
      startDate: recentCutoff,
    })

    if (npsSignal) {
      return createDetectedSignal(accountId, workspaceId, 'low_nps', npsSignal.value, {
        nps_score: npsSignal.value,
        feedback_date: npsSignal.timestamp,
      })
    }

    return null
  },
}
