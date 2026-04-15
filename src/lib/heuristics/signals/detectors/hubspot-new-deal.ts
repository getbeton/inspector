/**
 * HubSpot New Deal Detector
 * Fires when a new deal is created in HubSpot CRM for an account.
 * Source: HubSpot CRM synced records (hubspot_records table).
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, createDetectedSignal, getHubSpotIdsForAccount } from '../helpers'

export const hubspotNewDealDetector: SignalDetectorDefinition = {
  meta: {
    name: 'hubspot_new_deal',
    category: 'expansion',
    description: 'New deal created in HubSpot CRM',
    defaultConfig: {
      lookback_days: 1,
      time_window_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const lookbackDays = config?.lookback_days ?? 1
    const timeWindowDays = config?.time_window_days ?? 7

    // Dedup
    if (await signalExists(supabase, accountId, 'hubspot_new_deal', lookbackDays)) {
      return null
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays)

    // Get account domain to scope query to this account's HubSpot records
    const { data: account } = await supabase
      .from('accounts')
      .select('domain')
      .eq('id', accountId)
      .single()

    if (!account?.domain) return null

    const dealIds = await getHubSpotIdsForAccount(supabase, workspaceId, account.domain, 'deals')
    if (dealIds.length === 0) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deals } = await (supabase as any)
      .from('hubspot_records')
      .select('hubspot_id, properties, hubspot_created_at')
      .eq('workspace_id', workspaceId)
      .eq('object_type', 'deals')
      .in('hubspot_id', dealIds)
      .gte('hubspot_created_at', cutoffDate.toISOString())
      .order('hubspot_created_at', { ascending: false })
      .limit(5)

    if (!deals || deals.length === 0) return null

    const newDeal = deals[0]
    const amount = newDeal.properties?.amount
      ? parseFloat(String(newDeal.properties.amount))
      : null

    return createDetectedSignal(accountId, workspaceId, 'hubspot_new_deal', amount, {
      deal_id: newDeal.hubspot_id,
      deal_name: newDeal.properties?.dealname || 'Unknown',
      amount: amount,
      pipeline: newDeal.properties?.pipeline || null,
      deal_stage: newDeal.properties?.dealstage || null,
      created_at: newDeal.hubspot_created_at,
      source: 'hubspot',
    })
  },
}
