/**
 * Trial Ending Detector
 * Detects trials expiring within 7 days
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, createDetectedSignal, daysBetween } from '../helpers'

export const trialEndingDetector: SignalDetectorDefinition = {
  meta: {
    name: 'trial_ending',
    category: 'expansion',
    description: 'Trial period ending soon',
    defaultConfig: {
      threshold_days: 7,
      trial_period: 14,
      lookback_days: 3,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const thresholdDays = config?.threshold_days ?? 7
    const trialPeriod = config?.trial_period ?? 14
    const lookbackDays = config?.lookback_days ?? 3

    if (await signalExists(supabase, accountId, 'trial_ending', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)

    if (!account || account.status !== 'trial') {
      return null
    }

    const trialLength = daysBetween(account.created_at)
    const daysRemaining = trialPeriod - trialLength

    if (daysRemaining > 0 && daysRemaining <= thresholdDays) {
      const trialEndDate = new Date(account.created_at)
      trialEndDate.setDate(trialEndDate.getDate() + trialPeriod)

      return createDetectedSignal(accountId, workspaceId, 'trial_ending', daysRemaining, {
        days_remaining: daysRemaining,
        trial_end_date: trialEndDate.toISOString(),
      })
    }

    return null
  },
}
