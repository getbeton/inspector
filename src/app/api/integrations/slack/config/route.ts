/**
 * GET  /api/integrations/slack/config — Fetch current Slack config
 * PATCH /api/integrations/slack/config — Update signal type toggles
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, requireWorkspace } from '@/lib/supabase/server'
import type { SlackConfigJson } from '@/lib/integrations/slack/types'
import type { IntegrationConfig, Json } from '@/lib/supabase/types'

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace()
    const supabase = await createClient()

    const { data } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'slack')
      .single()

    const config = data as IntegrationConfig | null

    if (!config) {
      return NextResponse.json({ connected: false })
    }

    const configJson = (config.config_json || {}) as unknown as SlackConfigJson

    return NextResponse.json({
      connected: config.status === 'connected' && config.is_active,
      status: config.status,
      teamName: configJson.slack_team_name || null,
      channelId: configJson.slack_channel_id || null,
      channelName: configJson.slack_channel_name || null,
      enabledSignalTypes: configJson.enabled_signal_types || [],
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    console.error('[Slack] Config fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()
    const supabase = await createClient()

    const body = (await request.json()) as { enabled_signal_types?: string[] }

    if (!body.enabled_signal_types || !Array.isArray(body.enabled_signal_types)) {
      return NextResponse.json(
        { error: 'enabled_signal_types must be an array' },
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
      enabled_signal_types: body.enabled_signal_types,
    }

    const { error } = await supabase
      .from('integration_configs')
      .update({ config_json: updatedConfig as unknown as Json } as never)
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'slack')

    if (error) {
      console.error('[Slack] Failed to update config:', error)
      return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    console.error('[Slack] Config update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
