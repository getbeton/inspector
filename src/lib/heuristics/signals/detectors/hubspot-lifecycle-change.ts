/**
 * HubSpot Lifecycle Stage Change Detector
 * Fires when a contact's lifecycle stage changes in HubSpot.
 * This can indicate progression (expansion) or regression (churn risk).
 * Source: HubSpot CRM synced records (hubspot_records table).
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, createDetectedSignal, getHubSpotIdsForAccount } from '../helpers'

/** HubSpot lifecycle stages in order of progression */
const LIFECYCLE_PROGRESSION = [
  'subscriber',
  'lead',
  'marketingqualifiedlead',
  'salesqualifiedlead',
  'opportunity',
  'customer',
  'evangelist',
]

export const hubspotLifecycleChangeDetector: SignalDetectorDefinition = {
  meta: {
    name: 'hubspot_lifecycle_change',
    category: 'expansion',
    description: 'Contact lifecycle stage changed in HubSpot',
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
    if (await signalExists(supabase, accountId, 'hubspot_lifecycle_change', lookbackDays)) {
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

    const contactIds = await getHubSpotIdsForAccount(supabase, workspaceId, account.domain, 'contacts')
    if (contactIds.length === 0) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contacts } = await (supabase as any)
      .from('hubspot_records')
      .select('hubspot_id, properties, hubspot_updated_at')
      .eq('workspace_id', workspaceId)
      .eq('object_type', 'contacts')
      .in('hubspot_id', contactIds)
      .gte('hubspot_updated_at', cutoffDate.toISOString())
      .order('hubspot_updated_at', { ascending: false })
      .limit(10)

    if (!contacts || contacts.length === 0) return null

    // Look for contacts with lifecycle stage set
    for (const contact of contacts) {
      const lifecycle = contact.properties?.lifecyclestage as string | undefined
      if (!lifecycle) continue

      const stageIndex = LIFECYCLE_PROGRESSION.indexOf(lifecycle.toLowerCase())
      if (stageIndex < 0) continue

      // Consider it noteworthy if the stage is at least "salesqualifiedlead" or beyond
      if (stageIndex >= 3) {
        return createDetectedSignal(
          accountId,
          workspaceId,
          'hubspot_lifecycle_change',
          stageIndex,
          {
            contact_id: contact.hubspot_id,
            email: contact.properties?.email || null,
            lifecycle_stage: lifecycle,
            stage_index: stageIndex,
            source: 'hubspot',
          }
        )
      }
    }

    return null
  },
}
