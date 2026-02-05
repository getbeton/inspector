/**
 * Usage Week-over-Week Decline Detector
 * Detects >15% WoW usage decrease
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, countSignals, createDetectedSignal, calculatePercentageChange, daysAgo } from '../helpers'

export const usageWoWDeclineDetector: SignalDetectorDefinition = {
  meta: {
    name: 'usage_wow_decline',
    category: 'churn_risk',
    description: 'Week-over-week usage decline',
    defaultConfig: {
      threshold: -0.15,
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const threshold = config?.threshold ?? -0.15
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'usage_wow_decline', lookbackDays)) {
      return null
    }

    const thisWeekStart = daysAgo(7)
    const lastWeekStart = daysAgo(14)

    const thisWeekUsage = await countSignals(supabase, accountId, {
      startDate: thisWeekStart,
    })

    const lastWeekUsage = await countSignals(supabase, accountId, {
      startDate: lastWeekStart,
      endDate: thisWeekStart,
    })

    const prevValue = lastWeekUsage || 1
    const pctChange = calculatePercentageChange(prevValue, thisWeekUsage)

    if (pctChange <= threshold) {
      return createDetectedSignal(accountId, workspaceId, 'usage_wow_decline', pctChange, {
        this_week_usage: thisWeekUsage,
        last_week_usage: lastWeekUsage,
        wow_decline_pct: Math.round(Math.abs(pctChange) * 1000) / 10,
      })
    }

    return null
  },
}
