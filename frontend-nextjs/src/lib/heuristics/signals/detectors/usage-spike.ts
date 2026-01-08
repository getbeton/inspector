/**
 * Usage Spike Detector
 * Detects significant increase in product usage (>20% increase over time window)
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, countSignals, createDetectedSignal, calculatePercentageChange, daysAgo } from '../helpers'

export const usageSpikeDetector: SignalDetectorDefinition = {
  meta: {
    name: 'usage_spike',
    category: 'expansion',
    description: 'Significant increase in product usage',
    defaultConfig: {
      time_window_days: 14,
      threshold: 0.20,
      lookback_days: 1,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const timeWindowDays = config?.time_window_days ?? 14
    const threshold = config?.threshold ?? 0.20
    const lookbackDays = config?.lookback_days ?? 1

    // Check for existing signal
    if (await signalExists(supabase, accountId, 'usage_spike', lookbackDays)) {
      return null
    }

    // Calculate usage in current and previous periods
    const currentPeriodStart = daysAgo(timeWindowDays)
    const previousPeriodStart = daysAgo(timeWindowDays * 2)

    const currentUsage = await countSignals(supabase, accountId, {
      startDate: currentPeriodStart,
    })

    const previousUsage = await countSignals(supabase, accountId, {
      startDate: previousPeriodStart,
      endDate: currentPeriodStart,
    })

    // Avoid division by zero
    const prevValue = previousUsage || 1
    const pctChange = calculatePercentageChange(prevValue, currentUsage)

    if (pctChange >= threshold) {
      return createDetectedSignal(accountId, workspaceId, 'usage_spike', pctChange, {
        current_usage: currentUsage,
        previous_usage: previousUsage,
        percentage_change: Math.round(pctChange * 1000) / 10,
      })
    }

    return null
  },
}
