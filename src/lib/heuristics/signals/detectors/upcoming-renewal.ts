/**
 * Upcoming Renewal Detector
 * Detects contract renewals approaching within 60 days
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, createDetectedSignal, daysBetween } from '../helpers'

export const upcomingRenewalDetector: SignalDetectorDefinition = {
  meta: {
    name: 'upcoming_renewal',
    category: 'expansion',
    description: 'Contract renewal approaching',
    defaultConfig: {
      threshold_days: 60,
      contract_period: 365,
      lookback_days: 14,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const thresholdDays = config?.threshold_days ?? 60
    const contractPeriod = config?.contract_period ?? 365
    const lookbackDays = config?.lookback_days ?? 14

    if (await signalExists(supabase, accountId, 'upcoming_renewal', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)

    if (!account || account.plan === 'free') {
      return null
    }

    const daysSinceCreation = daysBetween(account.created_at)
    const daysUntilRenewal = contractPeriod - (daysSinceCreation % contractPeriod)

    if (daysUntilRenewal <= thresholdDays) {
      const renewalDate = new Date()
      renewalDate.setDate(renewalDate.getDate() + daysUntilRenewal)

      return createDetectedSignal(accountId, workspaceId, 'upcoming_renewal', daysUntilRenewal, {
        days_until_renewal: daysUntilRenewal,
        renewal_date: renewalDate.toISOString(),
      })
    }

    return null
  },
}
