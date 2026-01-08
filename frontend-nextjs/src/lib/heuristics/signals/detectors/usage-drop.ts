/**
 * Usage Drop Detector
 * Detects significant decrease in product usage (>20% decrease over time window)
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, countSignals, createDetectedSignal, calculatePercentageChange, daysAgo } from '../helpers'

export const usageDropDetector: SignalDetectorDefinition = {
  meta: {
    name: 'usage_drop',
    category: 'churn_risk',
    description: 'Significant decrease in product usage',
    defaultConfig: {
      time_window_days: 14,
      threshold: -0.20,
      lookback_days: 1,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const timeWindowDays = config?.time_window_days ?? 14
    const threshold = config?.threshold ?? -0.20
    const lookbackDays = config?.lookback_days ?? 1

    if (await signalExists(supabase, accountId, 'usage_drop', lookbackDays)) {
      return null
    }

    const currentPeriodStart = daysAgo(timeWindowDays)
    const previousPeriodStart = daysAgo(timeWindowDays * 2)

    const currentUsage = await countSignals(supabase, accountId, {
      startDate: currentPeriodStart,
    })

    const previousUsage = await countSignals(supabase, accountId, {
      startDate: previousPeriodStart,
      endDate: currentPeriodStart,
    })

    const prevValue = previousUsage || 1
    const pctChange = calculatePercentageChange(prevValue, currentUsage)

    if (pctChange <= threshold) {
      return createDetectedSignal(accountId, workspaceId, 'usage_drop', pctChange, {
        current_usage: currentUsage,
        previous_usage: previousUsage,
        percentage_change: Math.round(pctChange * 1000) / 10,
      })
    }

    return null
  },
}
