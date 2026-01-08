/**
 * Upgrade Page Visit Detector
 * Detects free users visiting pricing/upgrade pages
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccount, createDetectedSignal, daysAgo } from '../helpers'

export const upgradePageVisitDetector: SignalDetectorDefinition = {
  meta: {
    name: 'upgrade_page_visit',
    category: 'expansion',
    description: 'Free user visited pricing/upgrade page',
    defaultConfig: {
      page_patterns: ['/pricing', '/upgrade', '/plans'],
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const pagePatterns = config?.page_patterns ?? ['/pricing', '/upgrade', '/plans']
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'upgrade_page_visit', lookbackDays)) {
      return null
    }

    const account = await getAccount(supabase, accountId)

    if (!account || account.plan !== 'free') {
      return null
    }

    const recentCutoff = daysAgo(7)

    // Check for page_view signals matching upgrade patterns
    const { data: pageViews } = await supabase
      .from('signals')
      .select('details, timestamp')
      .eq('account_id', accountId)
      .eq('type', 'page_view')
      .gte('timestamp', recentCutoff.toISOString())
      .order('timestamp', { ascending: false })

    if (!pageViews) return null

    for (const pageView of pageViews) {
      const page = (pageView.details as { page?: string })?.page ?? ''
      for (const pattern of pagePatterns) {
        if (page.startsWith(pattern)) {
          return createDetectedSignal(accountId, workspaceId, 'upgrade_page_visit', 1.0, {
            page,
            visit_date: pageView.timestamp,
          })
        }
      }
    }

    return null
  },
}
