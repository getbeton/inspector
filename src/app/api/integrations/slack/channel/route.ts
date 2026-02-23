/**
 * POST /api/integrations/slack/channel
 *
 * Save the selected channel for signal notifications.
 * Updates the config_json in integration_configs with channel_id and channel_name.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, requireWorkspace } from '@/lib/supabase/server'
import type { SlackConfigJson } from '@/lib/integrations/slack/types'
import type { IntegrationConfig, Json } from '@/lib/supabase/types'

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()
    const supabase = await createClient()

    const body = (await request.json()) as { channel_id?: string; channel_name?: string }

    if (!body.channel_id || !body.channel_name) {
      return NextResponse.json(
        { error: 'channel_id and channel_name are required' },
        { status: 400 }
      )
    }

    // Fetch current config to merge
    const { data } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'slack')
      .single()

    const existing = data as IntegrationConfig | null

    if (!existing) {
      return NextResponse.json(
        { error: 'Slack is not connected' },
        { status: 400 }
      )
    }

    const currentConfig = (existing.config_json || {}) as unknown as SlackConfigJson
    const updatedConfig: SlackConfigJson = {
      ...currentConfig,
      slack_channel_id: body.channel_id,
      slack_channel_name: body.channel_name,
    }

    const { error } = await supabase
      .from('integration_configs')
      .update({ config_json: updatedConfig as unknown as Json } as never)
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'slack')

    if (error) {
      console.error('[Slack] Failed to save channel:', error)
      return NextResponse.json({ error: 'Failed to save channel' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    console.error('[Slack] Save channel error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
