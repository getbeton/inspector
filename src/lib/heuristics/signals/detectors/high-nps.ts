/**
 * High NPS Detector
 * Detects high NPS scores (promoters with NPS >= 9)
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getLatestSignal, createDetectedSignal, daysAgo } from '../helpers'

export const highNPSDetector: SignalDetectorDefinition = {
  meta: {
    name: 'high_nps',
    category: 'expansion',
    description: 'High NPS score (promoter)',
    defaultConfig: {
      threshold: 9,
      time_window_days: 90,
      lookback_days: 30,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const threshold = config?.threshold ?? 9
    const timeWindowDays = config?.time_window_days ?? 90
    const lookbackDays = config?.lookback_days ?? 30

    if (await signalExists(supabase, accountId, 'high_nps', lookbackDays)) {
      return null
    }

    const recentCutoff = daysAgo(timeWindowDays)

    const npsSignal = await getLatestSignal(supabase, accountId, 'nps_response', {
      minValue: threshold,
      startDate: recentCutoff,
    })

    if (npsSignal) {
      return createDetectedSignal(accountId, workspaceId, 'high_nps', npsSignal.value, {
        nps_score: npsSignal.value,
        feedback_date: npsSignal.timestamp,
      })
    }

    return null
  },
}
