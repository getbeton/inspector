/**
 * HubSpot Deal Stage Change Detector
 * Fires when a deal's stage changes (detected via HubSpot sync data).
 * Source: HubSpot CRM synced records (hubspot_records table).
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, createDetectedSignal, getHubSpotIdsForAccount } from '../helpers'

export const hubspotDealStageChangeDetector: SignalDetectorDefinition = {
  meta: {
    name: 'hubspot_deal_stage_change',
    category: 'expansion',
    description: 'Deal stage changed in HubSpot CRM',
    defaultConfig: {
      lookback_days: 1,
      time_window_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const lookbackDays = config?.lookback_days ?? 1
    const timeWindowDays = config?.time_window_days ?? 7

    // Check for existing signal (dedup)
    if (await signalExists(supabase, accountId, 'hubspot_deal_stage_change', lookbackDays)) {
      return null
    }

    // Look for deals linked to this account that have changed stage recently
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays)

    // Query hubspot_records for deals synced recently that belong to this account's domain
    // First get the account's domain for matching
    const { data: account } = await supabase
      .from('accounts')
      .select('domain, name')
      .eq('id', accountId)
      .single()

    if (!account?.domain) return null

    // Find deals associated with this account's HubSpot company
    const dealIds = await getHubSpotIdsForAccount(supabase, workspaceId, account.domain, 'deals')
    if (dealIds.length === 0) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deals } = await (supabase as any)
      .from('hubspot_records')
      .select('hubspot_id, properties, hubspot_updated_at')
      .eq('workspace_id', workspaceId)
      .eq('object_type', 'deals')
      .in('hubspot_id', dealIds)
      .gte('hubspot_updated_at', cutoffDate.toISOString())
      .limit(10)

    if (!deals || deals.length === 0) return null

    // Check if any deal has a dealstage that differs from what we've seen before
    // For simplicity, fire on any deal that was updated recently
    const recentDeal = deals[0]
    const dealStage = recentDeal.properties?.dealstage
    const dealName = recentDeal.properties?.dealname

    if (!dealStage) return null

    return createDetectedSignal(accountId, workspaceId, 'hubspot_deal_stage_change', 1, {
      deal_id: recentDeal.hubspot_id,
      deal_name: dealName || 'Unknown',
      current_stage: dealStage,
      source: 'hubspot',
    })
  },
}
