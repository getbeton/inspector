/**
 * HubSpot Meeting Booked Detector
 * Fires when a new meeting engagement is logged in HubSpot for an account.
 * Meetings indicate active engagement — positive expansion signal.
 * Source: HubSpot CRM synced records (hubspot_records table).
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, createDetectedSignal, getHubSpotIdsForAccount } from '../helpers'

export const hubspotMeetingBookedDetector: SignalDetectorDefinition = {
  meta: {
    name: 'hubspot_meeting_booked',
    category: 'expansion',
    description: 'New meeting logged in HubSpot',
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
    if (await signalExists(supabase, accountId, 'hubspot_meeting_booked', lookbackDays)) {
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

    const meetingIds = await getHubSpotIdsForAccount(supabase, workspaceId, account.domain, 'meetings')
    if (meetingIds.length === 0) return null

    // Note: meetings object_type is not currently synced (only contacts, companies, deals, tickets)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: meetings, count } = await (supabase as any)
      .from('hubspot_records')
      .select('hubspot_id, properties, hubspot_created_at', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .eq('object_type', 'meetings')
      .in('hubspot_id', meetingIds)
      .gte('hubspot_created_at', cutoffDate.toISOString())
      .order('hubspot_created_at', { ascending: false })
      .limit(5)

    const meetingCount = count ?? meetings?.length ?? 0
    if (meetingCount === 0) return null

    const latestMeeting = meetings?.[0]

    return createDetectedSignal(
      accountId,
      workspaceId,
      'hubspot_meeting_booked',
      meetingCount,
      {
        meeting_count: meetingCount,
        latest_meeting_id: latestMeeting?.hubspot_id || null,
        latest_timestamp: latestMeeting?.properties?.hs_timestamp || null,
        time_window_days: timeWindowDays,
        source: 'hubspot',
      }
    )
  },
}
