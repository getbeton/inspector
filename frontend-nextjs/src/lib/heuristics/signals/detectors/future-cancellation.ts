/**
 * Future Cancellation Detector
 * Detects scheduled cancellations
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, createDetectedSignal, daysBetween } from '../helpers'

export const futureCancellationDetector: SignalDetectorDefinition = {
  meta: {
    name: 'future_cancellation',
    category: 'churn_risk',
    description: 'Scheduled cancellation detected',
    defaultConfig: {
      lookback_days: 3,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const lookbackDays = config?.lookback_days ?? 3

    if (await signalExists(supabase, accountId, 'future_cancellation', lookbackDays)) {
      return null
    }

    // Check for cancellation_scheduled signals
    const { data: cancellations } = await supabase
      .from('signals')
      .select('details, timestamp')
      .eq('account_id', accountId)
      .eq('type', 'cancellation_scheduled')
      .order('timestamp', { ascending: false })
      .limit(1)

    if (!cancellations || cancellations.length === 0) {
      return null
    }

    const cancellation = cancellations[0]
    const cancellationDate = (cancellation.details as { cancellation_date?: string })?.cancellation_date

    if (cancellationDate) {
      const daysUntilCancellation = daysBetween(new Date(), cancellationDate)

      if (daysUntilCancellation > 0) {
        return createDetectedSignal(accountId, workspaceId, 'future_cancellation', daysUntilCancellation, {
          cancellation_date: cancellationDate,
          days_remaining: daysUntilCancellation,
        })
      }
    }

    return null
  },
}
