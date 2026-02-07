/**
 * Nearing Paywall Detector
 * Detects accounts approaching usage/plan limits (80%+ utilization)
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, createDetectedSignal } from '../helpers'

export const nearingPaywallDetector: SignalDetectorDefinition = {
  meta: {
    name: 'nearing_paywall',
    category: 'expansion',
    description: 'Account approaching usage/plan limits',
    defaultConfig: {
      threshold: 0.80,
      lookback_days: 1,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const threshold = config?.threshold ?? 0.80
    const lookbackDays = config?.lookback_days ?? 1

    if (await signalExists(supabase, accountId, 'nearing_paywall', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)
    if (!account || account.plan !== 'free') {
      return null
    }

    // Count users for the account
    const { count: userCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)

    // Free plan limit: 5 users
    const planLimit = 5
    const utilization = (userCount ?? 0) / planLimit

    if (utilization >= threshold) {
      return createDetectedSignal(accountId, workspaceId, 'nearing_paywall', utilization, {
        user_count: userCount,
        plan_limit: planLimit,
        utilization_pct: Math.round(utilization * 1000) / 10,
      })
    }

    return null
  },
}
