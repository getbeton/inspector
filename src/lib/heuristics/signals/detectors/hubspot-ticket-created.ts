/**
 * HubSpot Ticket Created Detector
 * Fires when a new support ticket is created in HubSpot for an account.
 * Classified as churn_risk since increased support volume may indicate issues.
 * Source: HubSpot CRM synced records (hubspot_records table).
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, createDetectedSignal } from '../helpers'

export const hubspotTicketCreatedDetector: SignalDetectorDefinition = {
  meta: {
    name: 'hubspot_ticket_created',
    category: 'churn_risk',
    description: 'New support ticket created in HubSpot',
    defaultConfig: {
      lookback_days: 1,
      time_window_days: 7,
      threshold: 2, // fire when >= 2 tickets in the window
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const lookbackDays = config?.lookback_days ?? 1
    const timeWindowDays = config?.time_window_days ?? 7
    const threshold = config?.threshold ?? 2

    // Dedup
    if (await signalExists(supabase, accountId, 'hubspot_ticket_created', lookbackDays)) {
      return null
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays)

    // Count tickets created recently
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tickets, count } = await (supabase as any)
      .from('hubspot_records')
      .select('hubspot_id, properties', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .eq('object_type', 'tickets')
      .gte('hubspot_created_at', cutoffDate.toISOString())
      .limit(5)

    const ticketCount = count ?? tickets?.length ?? 0

    if (ticketCount < threshold) return null

    // Get the most recent ticket for details
    const latestTicket = tickets?.[0]

    return createDetectedSignal(
      accountId,
      workspaceId,
      'hubspot_ticket_created',
      ticketCount,
      {
        ticket_count: ticketCount,
        latest_subject: latestTicket?.properties?.subject || null,
        latest_priority: latestTicket?.properties?.hs_ticket_priority || null,
        time_window_days: timeWindowDays,
        source: 'hubspot',
      }
    )
  },
}
