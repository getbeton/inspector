/**
 * Free Decision Maker Detector
 * Detects decision makers (director+) on free plan
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, getAccountUsers, createDetectedSignal, isDirectorLevel } from '../helpers'

export const freeDecisionMakerDetector: SignalDetectorDefinition = {
  meta: {
    name: 'free_decision_maker',
    category: 'expansion',
    description: 'Decision maker on free plan',
    defaultConfig: {
      lookback_days: 14,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const lookbackDays = config?.lookback_days ?? 14

    if (await signalExists(supabase, accountId, 'free_decision_maker', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)

    if (!account || account.plan !== 'free') {
      return null
    }

    const users = await getAccountUsers(supabase, accountId)

    for (const user of users) {
      if (isDirectorLevel(user.title)) {
        return createDetectedSignal(accountId, workspaceId, 'free_decision_maker', 1.0, {
          user_name: user.name,
          title: user.title,
          plan: account.plan,
        })
      }
    }

    return null
  },
}
