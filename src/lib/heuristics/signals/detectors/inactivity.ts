/**
 * Inactivity Detector
 * Detects accounts with no activity for >60 days
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, createDetectedSignal, daysBetween } from '../helpers'

export const inactivityDetector: SignalDetectorDefinition = {
  meta: {
    name: 'inactivity',
    category: 'churn_risk',
    description: 'Account inactive for extended period',
    defaultConfig: {
      threshold_days: 60,
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const thresholdDays = config?.threshold_days ?? 60
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'inactivity', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)

    if (!account || !account.last_activity_at) {
      return null
    }

    const daysInactive = daysBetween(account.last_activity_at)

    if (daysInactive >= thresholdDays) {
      return createDetectedSignal(accountId, workspaceId, 'inactivity', daysInactive, {
        days_inactive: daysInactive,
        last_activity: account.last_activity_at,
      })
    }

    return null
  },
}
