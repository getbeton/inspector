/**
 * Approaching Seat Limit Detector
 * Detects accounts at 85%+ seat utilization
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, createDetectedSignal } from '../helpers'

const SEAT_LIMITS: Record<string, number> = {
  starter: 10,
  pro: 25,
  enterprise: 100,
}

export const approachingSeatLimitDetector: SignalDetectorDefinition = {
  meta: {
    name: 'approaching_seat_limit',
    category: 'expansion',
    description: 'Account at 85%+ seat utilization',
    defaultConfig: {
      threshold: 0.85,
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const threshold = config?.threshold ?? 0.85
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'approaching_seat_limit', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)

    if (!account || account.plan === 'free') {
      return null
    }

    // Count active users
    const { count: userCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)

    const seatLimit = SEAT_LIMITS[account.plan ?? ''] ?? 10
    const utilization = (userCount ?? 0) / seatLimit

    if (utilization >= threshold) {
      return createDetectedSignal(accountId, workspaceId, 'approaching_seat_limit', utilization, {
        user_count: userCount,
        seat_limit: seatLimit,
        utilization_pct: Math.round(utilization * 1000) / 10,
      })
    }

    return null
  },
}
