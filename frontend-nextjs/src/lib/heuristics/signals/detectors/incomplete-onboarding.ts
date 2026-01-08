/**
 * Incomplete Onboarding Detector
 * Detects incomplete onboarding after threshold period (14 days)
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, createDetectedSignal, daysBetween } from '../helpers'

export const incompleteOnboardingDetector: SignalDetectorDefinition = {
  meta: {
    name: 'incomplete_onboarding',
    category: 'churn_risk',
    description: 'Incomplete onboarding after threshold period',
    defaultConfig: {
      threshold_days: 14,
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const thresholdDays = config?.threshold_days ?? 14
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'incomplete_onboarding', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)

    if (!account) {
      return null
    }

    const daysSinceCreation = daysBetween(account.created_at)

    if (daysSinceCreation < thresholdDays) {
      return null
    }

    // Check for onboarding_complete signal
    const { data: onboardingComplete } = await supabase
      .from('signals')
      .select('id')
      .eq('account_id', accountId)
      .eq('type', 'onboarding_complete')
      .limit(1)

    if (!onboardingComplete || onboardingComplete.length === 0) {
      return createDetectedSignal(accountId, workspaceId, 'incomplete_onboarding', daysSinceCreation, {
        days_since_creation: daysSinceCreation,
        account_created: account.created_at,
      })
    }

    return null
  },
}
