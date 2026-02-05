/**
 * ARR Decrease Detector
 * Detects ARR decreases (revenue decline)
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, getLatestSignal, createDetectedSignal, daysAgo } from '../helpers'

export const arrDecreaseDetector: SignalDetectorDefinition = {
  meta: {
    name: 'arr_decrease',
    category: 'churn_risk',
    description: 'ARR decreased',
    defaultConfig: {
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'arr_decrease', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)

    if (!account) {
      return null
    }

    const weekAgo = daysAgo(7)

    // Check for arr_change signals with negative value
    const { data: arrChanges } = await supabase
      .from('signals')
      .select('value, timestamp')
      .eq('account_id', accountId)
      .eq('type', 'arr_change')
      .gte('timestamp', weekAgo.toISOString())
      .lt('value', 0)
      .order('timestamp', { ascending: false })

    if (arrChanges && arrChanges.length > 0) {
      const change = arrChanges[0]

      return createDetectedSignal(accountId, workspaceId, 'arr_decrease', change.value, {
        arr_change: change.value,
        current_arr: account.arr,
        change_date: change.timestamp,
      })
    }

    return null
  },
}
