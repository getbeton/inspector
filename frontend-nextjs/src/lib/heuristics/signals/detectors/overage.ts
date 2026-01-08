/**
 * Overage Detector
 * Detects usage beyond plan limits
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, createDetectedSignal } from '../helpers'

const SEAT_LIMITS: Record<string, number> = {
  free: 5,
  starter: 10,
  pro: 25,
}

export const overageDetector: SignalDetectorDefinition = {
  meta: {
    name: 'overage',
    category: 'expansion',
    description: 'Usage beyond plan limits',
    defaultConfig: {
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'overage', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)

    if (!account) {
      return null
    }

    // Count users
    const { count: userCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)

    const limit = SEAT_LIMITS[account.plan ?? ''] ?? 999
    const currentUsage = userCount ?? 0

    if (currentUsage > limit) {
      const overageAmount = currentUsage - limit

      return createDetectedSignal(accountId, workspaceId, 'overage', overageAmount, {
        current_usage: currentUsage,
        plan_limit: limit,
        overage_amount: overageAmount,
      })
    }

    return null
  },
}
