/**
 * POST /api/integrations/slack/test
 *
 * Send a test notification to the configured Slack channel.
 * Validates the full path: credentials → Slack API → message delivery.
 * Uses Block Kit with Beton branding for a polished welcome message.
 */

import { NextResponse } from 'next/server'
import { requireWorkspace, createClient } from '@/lib/supabase/server'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { createSlackClient, SlackAuthError, SlackChannelError } from '@/lib/integrations/slack/client'
import type { SlackConfigJson } from '@/lib/integrations/slack/types'
import type { IntegrationConfig } from '@/lib/supabase/types'

export async function POST() {
  try {
    const { workspaceId } = await requireWorkspace()

    // Fetch credentials
    const credentials = await getIntegrationCredentials(workspaceId, 'slack')
    if (!credentials || !credentials.isActive || credentials.status !== 'connected') {
      return NextResponse.json(
        { error: 'Slack is not connected. Please install the Slack app first.' },
        { status: 400 }
      )
    }

    // Fetch channel from config_json
    const supabase = await createClient()
    const { data } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'slack')
      .single()

    const config = data as IntegrationConfig | null
    const configJson = (config?.config_json || {}) as unknown as SlackConfigJson
    if (!configJson.slack_channel_id) {
      return NextResponse.json(
        { error: 'No channel selected. Please select a channel first.' },
        { status: 400 }
      )
    }

    // Build Block Kit test message
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':white_check_mark: *Beton Inspector connected successfully!*\nSignal notifications will appear here.',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Sent by <https://betoninspector.com|Beton Inspector> · This is a test notification',
          },
        ],
      },
    ]

    const fallbackText =
      'Beton Inspector connected successfully! Signal notifications will appear here.'

    // Send the message
    const client = createSlackClient({ botToken: credentials.apiKey })
    const result = await client.postMessage(configJson.slack_channel_id, blocks, fallbackText)

    return NextResponse.json({
      success: true,
      channel: configJson.slack_channel_name,
      timestamp: result.timestamp,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (error instanceof SlackAuthError) {
      return NextResponse.json(
        { error: 'Slack token is invalid or revoked. Please reconnect.', code: 'token_revoked' },
        { status: 401 }
      )
    }
    if (error instanceof SlackChannelError) {
      return NextResponse.json(
        { error: error.message, code: error.slackErrorCode },
        { status: 400 }
      )
    }
    console.error('[Slack] Test notification error:', error)
    return NextResponse.json({ error: 'Failed to send test notification' }, { status: 500 })
  }
}
