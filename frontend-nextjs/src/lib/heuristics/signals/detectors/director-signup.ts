/**
 * Director Signup Detector
 * Detects when a director-level or above user signs up
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, createDetectedSignal, isDirectorLevel, daysAgo } from '../helpers'

export const directorSignupDetector: SignalDetectorDefinition = {
  meta: {
    name: 'director_signup',
    category: 'expansion',
    description: 'Director-level or above user signed up',
    defaultConfig: {
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'director_signup', lookbackDays)) {
      return null
    }

    // Check for recent users with director-level titles
    const recentCutoff = daysAgo(7)

    const { data: recentUsers } = await supabase
      .from('users')
      .select('name, email, title')
      .eq('account_id', accountId)
      .gte('created_at', recentCutoff.toISOString())

    if (!recentUsers) return null

    for (const user of recentUsers) {
      if (isDirectorLevel(user.title)) {
        return createDetectedSignal(accountId, workspaceId, 'director_signup', 1.0, {
          user_name: user.name,
          user_email: user.email,
          title: user.title,
        })
      }
    }

    return null
  },
}
