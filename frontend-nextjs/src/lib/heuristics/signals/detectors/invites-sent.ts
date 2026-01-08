/**
 * Invites Sent Detector
 * Detects high invite activity indicating internal adoption (5+ invites in 30 days)
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, countSignals, createDetectedSignal, daysAgo } from '../helpers'

export const invitesSentDetector: SignalDetectorDefinition = {
  meta: {
    name: 'invites_sent',
    category: 'expansion',
    description: 'High invite activity indicating internal adoption',
    defaultConfig: {
      time_window_days: 30,
      threshold: 5,
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const timeWindowDays = config?.time_window_days ?? 30
    const threshold = config?.threshold ?? 5
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'invites_sent', lookbackDays)) {
      return null
    }

    const cutoff = daysAgo(timeWindowDays)

    // Count user_invite signals
    const inviteCount = await countSignals(supabase, accountId, {
      type: 'user_invite',
      startDate: cutoff,
    })

    if (inviteCount >= threshold) {
      return createDetectedSignal(accountId, workspaceId, 'invites_sent', inviteCount, {
        invite_count: inviteCount,
        time_window_days: timeWindowDays,
      })
    }

    return null
  },
}
